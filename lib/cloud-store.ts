import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";
import { DEFAULT_FAVORITES } from "./catalog";
import { StoreError, SESSION_MS, emptyState, hashToken, text, username, password, settingsFor, eventFor, friendData, revisionFor, type FriendCig } from "./store-common";
import type { AsyncTrackerStore, MutationResult, StoreInput } from "./store-types";
import type { User, TrackerState, FriendRequest, SocialEvent } from "./social-types";

const deriveKey = promisify(scrypt);
const tokenValid = (token?: string): token is string => !!token && /^[A-Za-z0-9_-]{43}$/.test(token);
const WRITE_LOCK = 1579954023;

// One statement gives every part of a snapshot the same PostgreSQL MVCC view.
// Revision-only requests omit all event bodies, including private notes.
const SNAPSHOT = `WITH me AS (
  SELECT u.id,u.profile_json FROM ashtray.sessions s JOIN ashtray.users u ON u.id=s.user_id
  WHERE s.token_hash=$1 AND s.expires_at>$2
)
SELECT me.profile_json, COALESCE(r.own_revision,0)::text AS own_revision,
 CASE WHEN $3 THEN COALESCE((SELECT jsonb_agg(e.event_json ORDER BY e.logged_at DESC,e.id DESC)
   FROM ashtray.tracker_events e WHERE e.user_id=me.id),'[]'::jsonb) ELSE '[]'::jsonb END AS events,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'profile',u.profile_json,'connectedAt',f.connected_at,
   'activityRevision',COALESCE(sr.activity_revision,0)::text,
   'cigarettes',CASE WHEN $3 AND u.profile_json->>'sharing' IN ('summary','activity') THEN
     COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.event_json->'id','productId',e.event_json->'productId',
       'productName',e.event_json->'productName','quantity',e.event_json->'quantity',
       'loggedAt',e.event_json->'loggedAt','unitCostInr',e.event_json->'unitCostInr') ORDER BY e.logged_at DESC,e.id DESC)
       FROM ashtray.tracker_events e WHERE e.user_id=u.id AND e.event_json->>'kind'='cig'),'[]'::jsonb)
     ELSE '[]'::jsonb END) ORDER BY u.id)
   FROM ashtray.friendships f JOIN ashtray.users u ON u.id=CASE WHEN f.low_id=me.id THEN f.high_id ELSE f.low_id END
   LEFT JOIN ashtray.sync_revisions sr ON sr.user_id=u.id WHERE f.low_id=me.id OR f.high_id=me.id),'[]'::jsonb) AS peers,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'fromId',q.from_id,'toId',q.to_id,
   'name',u.profile_json->>'name','username',u.username,'createdAt',q.created_at) ORDER BY q.id)
   FROM ashtray.friend_requests q JOIN ashtray.users u ON u.id=CASE WHEN q.from_id=me.id THEN q.to_id ELSE q.from_id END
   WHERE q.from_id=me.id OR q.to_id=me.id),'[]'::jsonb) AS requests
 FROM me LEFT JOIN ashtray.sync_revisions r ON r.user_id=me.id`;

/** Durable account storage. No DDL or legacy public-table writes happen here. */
export class CloudStore implements AsyncTrackerStore {
  constructor(private readonly databaseURL: string) {
    if (!databaseURL) throw new Error("Cloud database is not configured.");
    if (typeof globalThis.WebSocket !== "function") throw new Error("Cloud storage requires a modern Node runtime.");
    neonConfig.webSocketConstructor = globalThis.WebSocket;
  }

  // A Pool belongs to one request, so no WebSocket outlives its invocation.
  private async using<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = new Pool({ connectionString: this.databaseURL, max: 1, connectionTimeoutMillis: 8000, idleTimeoutMillis: 1000 });
    pool.on("error", () => { /* Idle socket errors are recovered by the next request-local pool. */ });
    let client: PoolClient | undefined;
    try { client = await pool.connect(); return await work(client); }
    finally { client?.release(); await pool.end(); }
  }

  private async transaction<T>(client: PoolClient, work: () => Promise<T>): Promise<T> {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL lock_timeout='8s'; SET LOCAL statement_timeout='15s'");
      await client.query("SELECT pg_advisory_xact_lock($1)", [WRITE_LOCK]);
      const value = await work(); await client.query("COMMIT"); return value;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  }

  private async user(client: PoolClient, token?: string): Promise<User | null> {
    if (!tokenValid(token)) return null;
    const result = await client.query("SELECT u.profile_json FROM ashtray.sessions s JOIN ashtray.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2", [hashToken(token), Date.now()]);
    return result.rows[0]?.profile_json ?? null;
  }

  private async snapshot(client: PoolClient, token: string, includeEvents: boolean): Promise<TrackerState | null> {
    const now = new Date();
    const result = await client.query(SNAPSHOT, [hashToken(token), now.getTime(), includeEvents]);
    const row = result.rows[0]; if (!row) return null;
    const user = row.profile_json as User;
    const peers = row.peers as Array<{profile:User;connectedAt:string;activityRevision:string;cigarettes:FriendCig[]}>;
    const requests = row.requests as FriendRequest[];
    return { user, events: row.events as SocialEvent[],
      revision: revisionFor(user,row.own_revision,peers,requests.map(q=>[q.id,q.name,q.username]),now),
      friends: includeEvents ? peers.map(peer=>({id:peer.profile.id,name:peer.profile.name,username:peer.profile.username,
        sharing:peer.profile.sharing,connectedAt:peer.connectedAt,...friendData(peer.profile,peer.cigarettes,now)})) : [],
      requests: requests.filter(q=>q.toId===user.id), sentRequests:requests.filter(q=>q.fromId===user.id) };
  }

  async state(token?: string): Promise<TrackerState> {
    if (!tokenValid(token)) return emptyState();
    return this.using(async client=>(await this.snapshot(client,token,true))??emptyState());
  }
  async syncRevision(token?: string): Promise<string|null> {
    if (!tokenValid(token)) return null;
    return this.using(async client=>(await this.snapshot(client,token,false))?.revision??null);
  }
  async close(): Promise<void> { /* Request-local pools already close in finally. */ }

  private async limit(client: PoolClient, key:string, max:number, windowMs:number) {
    const now=Date.now();
    const result=await client.query(`INSERT INTO ashtray.rate_limits(key,count,reset_at) VALUES($1,1,$2)
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ashtray.rate_limits.reset_at<=$3 THEN 1 ELSE ashtray.rate_limits.count+1 END,
      reset_at=CASE WHEN ashtray.rate_limits.reset_at<=$3 THEN $2 ELSE ashtray.rate_limits.reset_at END RETURNING count`,[hashToken(key),now+windowMs,now]);
    if(result.rows[0].count>max)throw new StoreError("Too many attempts. Please try again in a few minutes.",429);
    await client.query("DELETE FROM ashtray.rate_limits WHERE reset_at<$1",[now]);
  }
  private async session(client: PoolClient, userId:string, oldToken?:string) {
    if(oldToken)await client.query("DELETE FROM ashtray.sessions WHERE token_hash=$1",[hashToken(oldToken)]);
    const token=randomBytes(32).toString("base64url");
    await client.query("DELETE FROM ashtray.sessions WHERE expires_at<=$1",[Date.now()]);
    await client.query("INSERT INTO ashtray.sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",[hashToken(token),userId,Date.now()+SESSION_MS]);
    return token;
  }

  private async authenticate(client: PoolClient,input:StoreInput,token?:string):Promise<MutationResult> {
    const action=input.action;
    const rateHandle=typeof input.username==="string"?input.username.trim().toLowerCase().slice(0,64):"invalid";
    // Commit attempts before any password failure can roll back work.
    await this.transaction(client,async()=>{
      await this.limit(client,"authentication:global",100,60000);
      await this.limit(client,`authentication:${rateHandle}`,12,15*60000);
      if(action==="register")await this.limit(client,"registration:global",30,60*60000);
    });
    const handle=username(input.username);const secret=password(input.password);
    let sessionToken:string;
    if(action==="register"){
      const name=text(input.name,"Name",1,60),salt=randomBytes(16).toString("hex");
      const hash=await deriveKey(secret,salt,64) as Buffer;
      const user:User={id:randomUUID(),name,username:handle,inviteCode:`ASH-${randomBytes(6).toString("hex").toUpperCase()}`,
        timezone:"Asia/Kolkata",city:"",cigBaseline:8,drinkBaseline:2,dailyLimit:8,defaultPrice:25,sharing:"summary",
        priceOverrides:{},favoriteIds:[...DEFAULT_FAVORITES],createdAt:new Date().toISOString()};
      sessionToken=await this.transaction(client,async()=>{
        if((await client.query("SELECT id FROM ashtray.users WHERE username=$1",[handle])).rowCount)throw new StoreError("That username is already taken. Try another one.",409);
        await client.query("INSERT INTO ashtray.users(id,username,invite_code,password_hash,password_salt,profile_json,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)",
          [user.id,handle,user.inviteCode,hash.toString("hex"),salt,JSON.stringify(user),user.createdAt]);
        return this.session(client,user.id,token);
      });
    }else{
      const row=(await client.query("SELECT id,password_hash,password_salt FROM ashtray.users WHERE username=$1",[handle])).rows[0];
      const salt=row?.password_salt??"d941ba520e6f6fbce0cd6e0f0fdf48c8";
      const expected=row?Buffer.from(row.password_hash,"hex"):Buffer.alloc(64);
      const derived=await deriveKey(secret,salt,64) as Buffer;
      if(!row||!timingSafeEqual(expected,derived))throw new StoreError("Username or password is incorrect.",401);
      sessionToken=await this.transaction(client,()=>this.session(client,row.id,token));
    }
    return {state:(await this.snapshot(client,sessionToken,true))??emptyState(),sessionToken};
  }

  async mutate(input:StoreInput,token?:string):Promise<MutationResult>{
    const action=text(input.action,"Action",1,30);
    return this.using(async client=>{
      if(action==="register"||action==="login")return this.authenticate(client,input,token);
      if(action==="logout"){
        if(token)await client.query("DELETE FROM ashtray.sessions WHERE token_hash=$1",[hashToken(token)]);
        return {state:emptyState(),clearSession:true};
      }
      await this.transaction(client,async()=>{
        const user=await this.user(client,token);if(!user)throw new StoreError("Sign in to continue.",401);
        await this.limit(client,`mutation:${user.id}`,120,60000);
        if(action==="request")await this.limit(client,`invites:${user.id}`,20,60*60000);
        await client.query("SAVEPOINT account_action");
        try{await this.action(client,user,action,input);}catch(error){
          if(error instanceof StoreError){
            await client.query("ROLLBACK TO SAVEPOINT account_action");
            // Return the error as data so the outer transaction commits attempts.
            return error;
          }
          throw error;
        }
        return null;
      }).then(error=>{if(error)throw error;});
      return {state:tokenValid(token)?(await this.snapshot(client,token,true))??emptyState():emptyState()};
    });
  }

  private async action(client:PoolClient,user:User,action:string,input:StoreInput){
    switch(action){
      case "log":{
        const {event,requestId,payloadHash}=eventFor(user,input);
        if(requestId){
          const prior=(await client.query("SELECT payload_hash FROM ashtray.log_requests WHERE user_id=$1 AND request_id=$2",[user.id,requestId])).rows[0];
          if(prior){if(prior.payload_hash!==payloadHash)throw new StoreError("That request was already used for a different check-in.",409);return;}
        }
        await client.query("INSERT INTO ashtray.tracker_events(id,user_id,logged_at,event_json) VALUES($1,$2,$3,$4::jsonb)",[event.id,user.id,event.loggedAt,JSON.stringify(event)]);
        if(requestId)await client.query("INSERT INTO ashtray.log_requests(user_id,request_id,payload_hash,event_id,created_at) VALUES($1,$2,$3,$4,$5)",[user.id,requestId,payloadHash,event.id,event.createdAt]);
        return;
      }
      case "delete":{
        const result=await client.query("DELETE FROM ashtray.tracker_events WHERE id=$1 AND user_id=$2",[text(input.id,"Entry ID",1,80),user.id]);
        if(!result.rowCount)throw new StoreError("That entry was not found.",404);return;
      }
      case "settings":{
        const next=settingsFor(user,input);
        await client.query("UPDATE ashtray.users SET profile_json=$1::jsonb WHERE id=$2",[JSON.stringify(next),user.id]);return;
      }
      case "request":{
        const code=text(input.code,"Invite code",1,64).toUpperCase().replace(/\s/g,"");
        const target=(await client.query("SELECT id FROM ashtray.users WHERE invite_code=$1",[code])).rows[0];
        if(!target)throw new StoreError("No account matches that invite code.",404);
        if(target.id===user.id)throw new StoreError("That is your own invite code.");
        const [low,high]=[user.id,target.id].sort();
        if((await client.query("SELECT low_id FROM ashtray.friendships WHERE low_id=$1 AND high_id=$2",[low,high])).rowCount)throw new StoreError("You are already connected.",409);
        const prior=(await client.query("SELECT from_id FROM ashtray.friend_requests WHERE low_id=$1 AND high_id=$2",[low,high])).rows[0];
        if(prior)throw new StoreError(prior.from_id===user.id?"Your request is already pending.":"This person has already requested you. Accept their request to connect.",409);
        await client.query("INSERT INTO ashtray.friend_requests(id,from_id,to_id,low_id,high_id,created_at) VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),user.id,target.id,low,high,new Date().toISOString()]);return;
      }
      case "respond":{
        const id=text(input.id,"Request ID",1,80);if(typeof input.accept!=="boolean")throw new StoreError("Choose accept or decline.");
        const pending=(await client.query("SELECT low_id,high_id FROM ashtray.friend_requests WHERE id=$1 AND to_id=$2",[id,user.id])).rows[0];
        if(!pending)throw new StoreError("That request was not found.",404);
        if(input.accept)await client.query("INSERT INTO ashtray.friendships(low_id,high_id,connected_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[pending.low_id,pending.high_id,new Date().toISOString()]);
        await client.query("DELETE FROM ashtray.friend_requests WHERE id=$1 AND to_id=$2",[id,user.id]);return;
      }
      case "remove":{
        const [low,high]=[user.id,text(input.id,"Friend ID",1,80)].sort();
        const result=await client.query("DELETE FROM ashtray.friendships WHERE low_id=$1 AND high_id=$2",[low,high]);
        if(!result.rowCount)throw new StoreError("That connection was not found.",404);return;
      }
      default:throw new StoreError("Unknown action.");
    }
  }
}

let singleton:CloudStore|undefined;
export function getCloudStore():CloudStore{
  return singleton??=new CloudStore(process.env.DATABASE_URL??"");
}
