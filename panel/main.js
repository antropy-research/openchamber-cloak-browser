(()=>{var _="openchamber.sdk",E=1;var qe=`
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [data-oc-scrolling] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [data-oc-scrolling] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [data-oc-scrolling]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [data-oc-scrolling] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;function et(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let n=new WeakMap;e.addEventListener("scroll",(d)=>{let l=d.target===e?r:d.target;if(!(l instanceof Element))return;if(!l.hasAttribute("data-oc-scrolling"))l.setAttribute("data-oc-scrolling","");let T=n.get(l);if(T!==void 0)clearTimeout(T);n.set(l,setTimeout(()=>{n.delete(l),l.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var Wo=`(${et.toString()})(document);`;var tt=128,ot=65536;var ge=128;var be=65536;var oo=/^[a-z][a-z0-9-]{0,39}$/;var qt=(e)=>Object(e)===e&&!Array.isArray(e),rt=(e,r)=>Object.keys(e).every((n)=>r.includes(n)),eo=(e)=>String(e)===e&&e.length>=1&&e.length<=60,to=(e)=>String(e)===e&&e.length>=1&&e.length<=80,ro=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let n of e){if(!qt(n)||!oo.test(n.id)||!eo(n.label))return!1;if(n.disabled!==void 0&&n.disabled!==!0&&n.disabled!==!1)return!1;if(r.has(n.id))return!1;if(r.add(n.id),n.kind==="button"){if(!rt(n,["kind","id","label","disabled"]))return!1;continue}if(n.kind!=="select"||!rt(n,["kind","id","label","value","options","disabled"]))return!1;if(!to(n.value)||!Array.isArray(n.options)||n.options.length<1||n.options.length>16)return!1;let d=new Set;for(let l of n.options){if(!qt(l)||!rt(l,["value","label"])||!to(l.value)||!eo(l.label)||d.has(l.value))return!1;d.add(l.value)}if(!d.has(n.value))return!1}return!0};var no=["{id}","{segment}","{segments+}"];var yr=new Set(no);var so=["turn-finished","turn-failed","permission-asked","question-asked"];var vr=new Set(so);var ke=20000000,Ie=256;var nt=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,io=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let n=0;n<e.bytes.byteLength;n+=1)if(e.bytes[n]!==r.bytes[n])return!1;return!0};var ao=/^[A-Za-z0-9_-]{1,80}$/;var co=["left","right","top","bottom"];var lo=(e,r=0,n={remaining:16000})=>{if(--n.remaining<0||r>=32)return!1;if(e===null)return!0;let d=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let l of d)if(!lo(l,r+1,n))return!1;return!0},st=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(st);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(st)}return String(e)===e||Number.isFinite(e)},it=(e)=>{try{if(String(e.id)!==e.id||!ao.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!co.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!lo(e.data)||!st(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var uo=["file","directory","other","missing"],ct=(e)=>Boolean(e&&"sessionId"in e),dt=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var _o=/^[0-9a-f]{7,64}$/i,lt=(e)=>_o.test(e),Ue=500,ye=32000,Eo=16000,To=128,So=200,fo=2000,Oo=16000,Ao=80,ho=200,mo=16000;var Ro=2000;var pt=20000,Ce=1024,ve=2000000;var Ne=64000,Me=8000,ut=4000;var _t=960000;var xo=999,go=1e4,_e=500,bo=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],ko=["stopped","starting","ready","failed"],Yo=new Set(bo),Io=(e)=>Yo.has(e),Uo=(e)=>e&&Io(e)?e:"HOST_REJECTED",ee=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(ee);if(Object(e)===e)return Object.values(e).every(ee);return!1},yo=(e)=>ee(e)&&JSON.stringify(e).length<=mo,po=(e)=>e?.trim().slice(0,ho)??"",te=(e)=>{let r=e.id.trim().slice(0,To),n=e.title.trim().slice(0,So),d=e.url.trim().slice(0,fo),l=e.text?.trim().slice(0,Oo),T=e.author?.trim().slice(0,Ao),I=e.kind==="pull"?"pull":"issue",x={providerId:e.providerId.trim(),id:r,title:n||r,url:d,kind:I};if(l)x.text=l;if(T)x.author=T;if(I==="pull"){let N=po(e.branches?.head),M=po(e.branches?.base);if(N&&M)x.branches={head:N,base:M}}if(yo(e.data))x.data=e.data;return x},Et=(e)=>{let r=te(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},Tt=(e)=>{let r={text:e.text.trim().slice(0,Eo)};if(e.send)r.send=!0;return r},St=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(xo,Math.max(0,Math.round(e)))},ft=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(go,Math.max(0,Math.ceil(e)))};var oe=(e)=>e.length>0&&e.length<=Ce&&!e.includes("\x00")&&!e.includes("\\");var Le=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>Ro)return!1;return!e.split("/").some((n)=>n==="."||n==="..")},Qo=new Set(ko),Ot=(e)=>Boolean(e&&"status"in e&&Qo.has(String(e.status))&&!("body"in e)),we=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),At=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),ht=(e)=>Boolean(e&&"written"in e&&e.written===!0),mt=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),Zo=new Set(uo),Rt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&Zo.has(String(e.kind))&&Number.isFinite(e.size)),xt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),qo=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late"]),er=(e)=>Object(e)===e?e:null,at=(e)=>String(e)===e&&e.length>0,tr=(e)=>{if(!at(e.id))return null;if(e.ok===!0){let r={channel:_,v:E,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&at(e.error))return{channel:_,v:E,type:"result",id:e.id,ok:!1,error:e.error,code:Uo(at(e.code)?e.code:void 0)};return null},gt=(e)=>{let r=er(e);if(!r||r.channel!==_||r.v!==E)return null;if(r.type==="result")return tr(r);if(!qo.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var Co=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),or=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class a extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var vo=()=>Promise.reject(new a("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),Pe=()=>Promise.reject(new a("BAD_PATH",`File path must be 1 to ${Ce} characters without NUL or backslash.`)),Ge=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new a("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},u=(e)=>(e.value+=1,`oc-${e.value}`),bt=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new a("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let n=e.acceptSource??((t)=>t===r.parent),d=e.requestTimeoutMs??pt,l=new Set,T=new Set,I=new Set,x=new Set,N=new Set,M=new Set,B=new Set,fe=new Set,Oe=new Set,Y=new Set,We=[],ae=null,ce=null,Ae=new Set,he=new Set,de=null,le=null,Je=!1,Q=new Map,Z=new Map,q=new Map,X=!1,p={value:0},c=null,H=null,pe=!1,ue=!1,Ft=null,Vt=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},L=(t)=>{r.parent.postMessage(t,"*")},$t=()=>{if(X||r.parent===r||Y.size===0||c?.features?.lateGenerateResults!==!0)return;L({channel:_,v:E,type:"generate-late-listen"})},m=(t,o)=>{for(let s of t)try{s(o)}catch(i){console.error(i)}},Bt=(t)=>{if(!(t instanceof MessageEvent))return;if(!n(t.source))return;let o=gt(t.data);if(!o)return;if(o.type==="workspace"){let i=Z.get(o.payload.subscriptionId);if(i)m([i],o.payload.snapshot);return}if(o.type==="shells"){let i=q.get(o.payload.subscriptionId);if(i)m([i],o.payload.snapshot);return}if(o.type==="ready"){if(c=o.payload,H=Vt(o.payload.session),m(l,o.payload),m(T,o.payload.directory),m(I,o.payload.session),H)m(x,H);m(N,o.payload.connection),m(M,o.payload.settings),m(B,o.payload.item),$t();return}if(o.type==="generate-late"){if(Y.size===0)We.push(o.payload);else m(Y,o.payload);return}if(o.type==="directory"){if(c)c={...c,directory:o.payload.directory};m(T,o.payload.directory);return}if(o.type==="session"){if(c)c={...c,session:o.payload.session};if(!o.payload.session)H=null;else if(H?.sessionId!==o.payload.session.id)H=Vt(o.payload.session);m(I,o.payload.session);return}if(o.type==="session-lifecycle"){H=o.payload,m(x,o.payload);return}if(o.type==="connection"){if(c)c={...c,connection:o.payload.connection};m(N,o.payload.connection);return}if(o.type==="settings"){if(c)c={...c,settings:o.payload.settings};m(M,o.payload.settings);return}if(o.type==="item"){if(c)c={...c,item:o.payload.item};m(B,o.payload.item);return}if(o.type==="status-control-event"){m(fe,o.payload);return}if(o.type==="popover-closed"){m(Oe,o.payload);return}if(o.type==="action"){let i=(S)=>{if(!X)L({channel:_,v:E,type:"action-result",id:o.id,payload:S})},f=ce;if(!f){i({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>f(o.payload)).then(()=>i({ok:!0}),(S)=>{let k=(S instanceof Error?S.message:String(S)).trim();i({ok:!1,error:(k||"Action failed.").slice(0,_e)})});return}if(o.type==="file-open"){let i=o.payload;if(le&&io(le,i))return;le=i,m(Ae,o.payload);return}if(o.type==="file-saved"){m(he,o.payload.version);return}if(o.type==="file-snapshot"){let i=(k)=>{if(!X)L({channel:_,v:E,type:"file-snapshot-result",id:o.id,payload:k})},f=(k)=>i({error:(k.trim()||"Could not read the edited file.").slice(0,_e)}),S=de;if(!S){f("This extension does not edit files.");return}Promise.resolve().then(()=>S(o.payload.purpose)).then((k)=>{if(nt(k)>ke){f(`The file is over ${ke} ${"bytes"in k?"bytes":"characters"}.`);return}if(k.version.length>Ie){f(`The snapshot version is over ${Ie} characters.`);return}i({snapshot:"bytes"in k?{bytes:k.bytes,version:k.version}:{content:k.content,version:k.version}})},(k)=>f(k instanceof Error?k.message:String(k)));return}if(o.type==="resolve"){let i=(S)=>{L({channel:_,v:E,type:"resolve-result",id:o.id,payload:S})},f=ae;if(!f){i({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>f(o.payload)).then((S)=>i({item:S?te(S):null}),(S)=>{let k=(S instanceof Error?S.message:String(S)).trim();i({error:(k||"Command failed.").slice(0,_e)})});return}let s=Q.get(o.id);if(!s)return;if(clearTimeout(s.timer),Q.delete(o.id),o.ok){s.resolve(o.payload);return}s.reject(new a(o.code,o.error))};r.addEventListener("message",Bt),L({channel:_,v:E,type:"hello"});let C=(t,o=d)=>{if(X||r.parent===r)return Promise.reject(new a("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((s,i)=>{let f=setTimeout(()=>{Q.delete(t.id),i(new a("HOST_TIMEOUT","Host did not answer in time."))},o);Q.set(t.id,{resolve:s,reject:i,timer:f}),L(t)})},g=(t)=>C(t).then(()=>{return}),b={channel:_,v:E},Ye=(t)=>{if(!X&&r.parent!==r)L(t)},Kt=()=>Ye({...b,type:"file-save"}),jt=(t)=>{if(!Co(t)||!or(t))return;t.preventDefault(),Kt()},zt=(t)=>{if(!Co(t)||t.key!=="Escape"||c?.surface!=="popover"||!c.popover)return;t.preventDefault(),Qt(c.popover.id,"escape").catch(()=>{return})},me=()=>{let t=c?.surface==="popover"?c.popover:void 0;if(!t)return;let o=pe||ue;if(Ft===o)return;Ft=o,Zt(t.id,o).catch(()=>{return})},Re=()=>{if(c?.surface!=="popover"||pe)return;pe=!0,me()},Wt=(t)=>{if(c?.surface!=="popover"||t.relatedTarget!==null||!pe)return;pe=!1,me()},Jt=()=>{if(c?.surface!=="popover"||ue)return;ue=!0,me()},Yt=()=>{if(c?.surface!=="popover"||!ue)return;ue=!1,me()},D=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new a("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},Qe=async(t)=>{if(t.kind!=="projects")D(t.projectId);let o=await C({...b,type:"workspace-read",id:u(p),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new a("HOST_REJECTED","Host did not return workspace data.");return o},Ze=async(t,o)=>{if(t.kind!=="projects")D(t.projectId);let s=u(p);Z.set(s,o);try{await g({...b,type:"workspace-subscribe",id:u(p),payload:{subscriptionId:s,query:t}})}catch(i){if(Z.delete(s),!X)L({...b,type:"workspace-unsubscribe",id:u(p),payload:{subscriptionId:s}});throw i}return()=>{if(!Z.delete(s)||X)return;L({...b,type:"workspace-unsubscribe",id:u(p),payload:{subscriptionId:s}})}},zo=async(t,o)=>{if(t.kind==="session")D(t.sessionId);if(t.kind==="project")D(t.projectId);let s=u(p);q.set(s,o);try{await g({...b,type:"shells-subscribe",id:u(p),payload:{subscriptionId:s,scope:t}})}catch(i){if(q.delete(s),!X)L({...b,type:"shells-unsubscribe",id:u(p),payload:{subscriptionId:s}});throw i}return()=>{if(!q.delete(s)||X)return;L({...b,type:"shells-unsubscribe",id:u(p),payload:{subscriptionId:s}})}},xe=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>tt))throw new a("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!ee(t.value))throw new a("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>ot)throw new a("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&c?.features?.deviceStorage!==!0)throw new a("UNSUPPORTED","This host does not support device storage.");let o=await C({...b,type:"storage",id:u(p),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new a("HOST_REJECTED","Host did not return storage data.");return o},Qt=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):g({...b,type:"popover-close",id:u(p),payload:o?{id:t,reason:o}:{id:t}}),Zt=(t,o)=>c?.features?.popovers!==!0&&!(c?.surface==="popover"&&c.popover?.id===t)?Promise.reject(new a("UNSUPPORTED","This host does not support popovers.")):g({...b,type:"popover-anchor",id:u(p),payload:{id:t,active:o}});return r.addEventListener("keydown",zt,!0),r.addEventListener("pointerover",Re),r.addEventListener("pointermove",Re),r.addEventListener("pointerout",Wt),r.addEventListener("focus",Jt),r.addEventListener("blur",Yt),{onAction:(t)=>(ce=t,()=>{if(ce===t)ce=null}),listProjects:async()=>{let t=await Qe({kind:"projects"});if(t.kind!=="projects")throw new a("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await Qe({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new a("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await Qe({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new a("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>Ze({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>Ze({kind:"worktrees",projectId:t},(s)=>{if(s.kind==="worktrees")o(s)}),onSessions:(t,o)=>Ze({kind:"sessions",projectId:t},(s)=>{if(s.kind==="sessions")o(s)}),onRunningShells:(t,o)=>zo(t,o),readShellOutput:async(t,o)=>{D(t,ge);let s=o?.cursor;if(s!==void 0&&(!Number.isInteger(s)||s<0))throw new a("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let i=o?.tailBytes;if(i!==void 0&&(!Number.isInteger(i)||i<1||i>be))throw new a("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${be}.`);let S=await C({...b,type:"shell-output",id:u(p),payload:{shellId:t,cursor:s,tailBytes:i}});if(!S||typeof S.output!=="string"||!Number.isFinite(S.cursor))throw new a("HOST_REJECTED","Host did not return shell output.");return S},stopShell:async(t)=>{if(D(t,ge),(await C({...b,type:"shell-stop",id:u(p),payload:{shellId:t}}))?.stopped!==!0)throw new a("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{D(t),await g({...b,type:"open-session",id:u(p),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let s=Ge(o),i={op:"get",key:t};if(s)i.scope=s;let f=await xe(i);return f.op==="get"&&f.found?f.value:void 0},set:async(t,o,s)=>{let i=Ge(s),f={op:"set",key:t,value:o};if(i)f.scope=i;await xe(f)},delete:async(t,o)=>{let s=Ge(o),i={op:"delete",key:t};if(s)i.scope=s;await xe(i)},keys:async(t)=>{let o=Ge(t),s={op:"keys"};if(o)s.scope=o;let i=await xe(s);if(i.op!=="keys")throw new a("HOST_REJECTED","Expected storage keys.");return i.keys}},onReady:(t)=>{if(l.add(t),c)t(c);return()=>{l.delete(t)}},onDirectory:(t)=>{if(T.add(t),c)t(c.directory);return()=>{T.delete(t)}},onSession:(t)=>{if(I.add(t),c)t(c.session);return()=>{I.delete(t)}},onSessionLifecycle:(t)=>{if(x.add(t),H)t(H);return()=>{x.delete(t)}},onConnection:(t)=>{if(N.add(t),c)t(c.connection);return()=>{N.delete(t)}},onSettings:(t)=>{if(M.add(t),c)t(c.settings);return()=>{M.delete(t)}},onItem:(t)=>{if(B.add(t),c)t(c.item);return()=>{B.delete(t)}},onStatusControl:(t)=>(fe.add(t),()=>{fe.delete(t)}),onPopoverClosed:(t)=>(Oe.add(t),()=>{Oe.delete(t)}),setStatusControls:(t)=>{if(c?.features?.statusControls!==!0)return Promise.reject(new a("UNSUPPORTED","This host does not support status controls."));if(!ro(t))return Promise.reject(new a("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return g({...b,type:"status-controls",id:u(p),payload:{controls:t}})},openPopover:(t)=>{if(c?.features?.popovers!==!0)return Promise.reject(new a("UNSUPPORTED","This host does not support popovers."));if(!it(t))return Promise.reject(new a("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return g({...b,type:"popover-open",id:u(p),payload:t})},closePopover:Qt,setPopoverAnchorActive:Zt,onResolve:(t)=>(ae=t,()=>{if(ae===t)ae=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>Ue)return Promise.reject(new a("HOST_REJECTED",`Toast message must contain 1 to ${Ue} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>ye))return Promise.reject(new a("HOST_REJECTED",`Toast copy text must contain 1 to ${ye} characters.`));return g({channel:_,v:E,type:"toast",id:u(p),payload:{...t,message:o}})},openUrl:(t)=>g({channel:_,v:E,type:"open-url",id:u(p),payload:{url:t}}),openCommit:(t)=>lt(t)?g({channel:_,v:E,type:"open-commit",id:u(p),payload:{sha:t}}):Promise.reject(new a("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),openSurface:(t)=>g({channel:_,v:E,type:"open-surface",id:u(p),payload:{surfaceId:t}}),writeClipboard:(t)=>g({channel:_,v:E,type:"clipboard-write",id:u(p),payload:{text:t}}),compose:(t)=>g({channel:_,v:E,type:"compose",id:u(p),payload:t}),attach:(t)=>g({channel:_,v:E,type:"attach",id:u(p),payload:te(t)}),startSession:async(t)=>{if(t.projectId!==void 0)D(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")D(o.directory);else{if(o.name!==void 0)D(o.name,200);if(o.baseBranch!==void 0)D(o.baseBranch,200)}let s=await C({channel:_,v:E,type:"start-session",id:u(p),payload:Et(t)},e.requestTimeoutMs??180000);if(!ct(s))throw new a("HOST_REJECTED","Host did not return a session.");return s},prompt:(t)=>C({channel:_,v:E,type:"prompt",id:u(p),payload:Tt(t)}).then((o)=>{if(!dt(o))throw new a("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>g({channel:_,v:E,type:"session-link",id:u(p),payload:te(t)}),close:()=>g({channel:_,v:E,type:"close",id:u(p)}),oauthStart:()=>g({channel:_,v:E,type:"oauth-start",id:u(p)}),oauthDisconnect:()=>g({channel:_,v:E,type:"oauth-disconnect",id:u(p)}),request:(t)=>(Le(t.path)?C({channel:_,v:E,type:"request",id:u(p),payload:t}):vo()).then((o)=>{if(!we(o))throw new a("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Le(t.path)?C({channel:_,v:E,type:"service-request",id:u(p),payload:t}):vo()).then((o)=>{if(!we(o))throw new a("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>C({channel:_,v:E,type:"service-status",id:u(p)}).then((t)=>{if(!Ot(t))throw new a("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(oe(t)?C({channel:_,v:E,type:"file-read",id:u(p),payload:{path:t}}):Pe()).then((o)=>{if(!At(o))throw new a("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!oe(t))return Pe();if(o.length>ve)return Promise.reject(new a("FILE_TOO_LARGE",`Content is over ${ve} characters.`));return C({channel:_,v:E,type:"file-write",id:u(p),payload:{path:t,content:o}}).then((s)=>{if(!ht(s))throw new a("HOST_REJECTED","Host did not confirm the write.");return s})},listDir:(t)=>(oe(t)?C({channel:_,v:E,type:"file-list",id:u(p),payload:{path:t}}):Pe()).then((o)=>{if(!mt(o))throw new a("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(oe(t)?C({channel:_,v:E,type:"file-stat",id:u(p),payload:{path:t}}):Pe()).then((o)=>{if(!Rt(o))throw new a("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),s=t.system?.trim();if(o.length===0||o.length>Ne)return Promise.reject(new a("HOST_REJECTED",`Prompt must be 1 to ${Ne} characters.`));if(s!==void 0&&(s.length===0||s.length>Me))return Promise.reject(new a("HOST_REJECTED",`System prompt must be 1 to ${Me} characters.`));let i=t.maxOutputTokens===void 0?void 0:Math.min(ut,Math.max(1,Math.floor(t.maxOutputTokens)));if(i!==void 0&&!Number.isFinite(i))return Promise.reject(new a("HOST_REJECTED","maxOutputTokens must be a number."));let f={prompt:o};if(s!==void 0)f.system=s;if(i!==void 0)f.maxOutputTokens=i;return C({channel:_,v:E,type:"generate",id:u(p),payload:f},e.requestTimeoutMs??_t).then((S)=>{if(!xt(S))throw new a("HOST_REJECTED","Host did not return generated text.");return S})},onLateGenerateResult:(t)=>{Y.add(t);for(let o of We.splice(0))m([t],o);return $t(),()=>{Y.delete(t)}},setBadge:(t)=>g({channel:_,v:E,type:"badge",id:u(p),payload:{count:St(t)}}),setHeight:(t)=>g({channel:_,v:E,type:"resize",id:u(p),payload:{height:ft(t)}}),onFileOpen:(t)=>{if(Ae.add(t),!Je)Je=!0,r.addEventListener("keydown",jt,!0);if(le)t(le);return()=>{Ae.delete(t)}},onFileSnapshot:(t)=>(de=t,()=>{if(de===t)de=null}),onFileSaved:(t)=>(he.add(t),()=>{he.delete(t)}),reportFileChange:(t)=>Ye({...b,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Kt,reportFileUnsupported:()=>Ye({...b,type:"file-unsupported"}),dispose:()=>{for(let t of Z.keys())L({...b,type:"workspace-unsubscribe",id:u(p),payload:{subscriptionId:t}});Z.clear();for(let t of q.keys())L({...b,type:"shells-unsubscribe",id:u(p),payload:{subscriptionId:t}});if(q.clear(),X=!0,ae=null,ce=null,de=null,Ae.clear(),he.clear(),Je)r.removeEventListener("keydown",jt,!0);r.removeEventListener("message",Bt),r.removeEventListener("keydown",zt,!0),r.removeEventListener("pointerover",Re),r.removeEventListener("pointermove",Re),r.removeEventListener("pointerout",Wt),r.removeEventListener("focus",Jt),r.removeEventListener("blur",Yt);for(let t of Q.values())clearTimeout(t.timer),t.reject(new a("HOST_UNAVAILABLE","Host client was disposed."));Q.clear(),l.clear(),T.clear(),I.clear(),x.clear(),N.clear(),M.clear(),B.clear(),fe.clear(),Oe.clear(),Y.clear(),We.length=0}}};var No=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var Kr=new Set(No);var Mo=["none","agent","user"];var zr=new Set(Mo);var rr=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],nr=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],Lo=(e,r)=>{r.style.colorScheme=e.mode;for(let[n,d]of rr)r.style.setProperty(n,e.tokens[d]);for(let[n,d,l]of nr){let T=e.tokens[l]??"";r.style.setProperty(n,T),r.style.setProperty(d,T)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size","0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},kt=(e,r)=>{if(Lo(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var sr={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},O=(e,r)=>`var(--${e}, var(--oc-${sr[e]}, ${r}))`,V=O("surface-background","transparent"),Xe=O("surface-elevated","transparent"),re=O("surface-elevated-foreground","inherit"),w=O("surface-foreground","inherit"),A=O("surface-muted-foreground","gray"),ir=O("surface-muted","transparent"),j=O("interactive-border","currentColor"),v=O("interactive-hover","transparent"),z=O("interactive-active","transparent"),It=O("interactive-selection","transparent"),Ut=O("interactive-selection-foreground","inherit"),F=O("primary","currentColor"),yt=O("primary-text","inherit"),Ct=O("error-text","inherit"),ar=O("font-sans","inherit"),vt=O("font-mono","monospace"),Do=O("radius","9px"),Nt=`calc(${Do} - 2px)`,wo=`calc(${Do} - 4px)`,h=(e,r,n="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${n})`,Po=`background-image: linear-gradient(${v}, ${v});`,Mt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Lt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",Go="box-shadow: var(--oc-sdk-lit);",wt=`inset 0 0.5px 0 0 ${h(w,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,cr=`
:root {
  --oc-sdk-edge: ${h(w,16)};
  --oc-sdk-field-bg: ${Xe};
  --oc-sdk-raised-bg: ${V};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${h(w,14)};
  --oc-sdk-field-bg: ${h(V,50,Xe)};
  --oc-sdk-raised-bg: ${Xe};
  --oc-sdk-field-lift: ${wt};
  --oc-sdk-raised-lift: ${wt};
  --oc-sdk-lit: ${wt};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,De=(e)=>{let r=O(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${O(`${e}-text`,"inherit")}; }`},dr=`
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: 6px; height: 28px; padding: 0 10px; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: 4px; height: 24px; padding: 0 8px; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: 14px; height: 14px; }

.oc-sdk-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: 32px; padding: 0 10px; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: 8px 10px; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: 34px; padding-right: 34px; }
.oc-sdk-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: 24px; height: 24px; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-width: calc(100vw - 16px); max-height: min(320px, calc(100vh - 16px)); overflow: auto; padding: 4px; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: 2px 2px 4px; }
.oc-sdk-popup-search .oc-sdk-input { height: 28px; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: 14px; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: 8px; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: 8px; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-top: 3px; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: 36px; height: 20px; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: 2px; padding: 2px; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: 1px 6px; font-size: 11px; font-weight: 500; line-height: 16px; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: 16px 8px; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 40px 16px; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: 12px; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: 8px; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: 16px; height: 16px; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: 12px; height: 12px; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: 8px; width: 100%; margin: 8px 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: 4px 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: 6px; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }
.oc-sdk-progress-value { display: inline-flex; align-items: center; gap: 2px; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { font-weight: 600; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: 8px 0; }
`,Xo=`${cr}
.oc-sdk { color: ${w}; font-family: ${ar}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Po} }
.oc-sdk-mono { font-family: ${vt}; }
.oc-sdk-muted { color: ${A}; }
${De("success")}${De("warning")}${De("error")}${De("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${F}; --oc-sdk-tone-text: ${yt}; }

.oc-sdk-btn { border-radius: ${Nt}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${wo}; }
.oc-sdk-btn[data-variant="default"] { color: ${yt}; background: ${h(F,10,V)}; border-color: ${h(F,12)}; ${Go} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${h(F,16,V)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${h(F,22,V)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${ir}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${v}, ${v}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${z}, ${z}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${re}; ${Lt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${v}, ${v}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${z}, ${z}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${v}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${z}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${O("status-error","red")}; color: ${Ct}; background: ${h("var(--oc-sdk-tone)",7,V)}; border-color: ${h("var(--oc-sdk-tone)",12)}; ${Go} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${h("var(--oc-sdk-tone)",9,V)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${h("var(--oc-sdk-tone)",11,V)}; box-shadow: none; }

.oc-sdk-field-note { color: ${A}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${Ct}; }
.oc-sdk-input { border-radius: ${Nt}; background: var(--oc-sdk-field-bg); color: ${re}; ${Mt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${A}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${v}, ${v}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${Mt(h(w,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${Mt(O("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${vt}; }

.oc-sdk-search-icon { color: ${A}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${F}; }
.oc-sdk-search-clear { border-radius: ${wo}; color: ${A}; }
.oc-sdk-search-clear:hover { background: ${v}; color: ${w}; }

.oc-sdk-trigger { border-radius: ${Nt}; background: var(--oc-sdk-raised-bg); color: ${re}; ${Lt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${v}, ${v}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${z}, ${z}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${A}; }
.oc-sdk-trigger-chevron { color: ${A}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${re}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${Xe}; background-clip: padding-box; color: ${re}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${v}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${It}; color: ${Ut}; }
.oc-sdk-option-check { color: ${w}; }
.oc-sdk-option[data-destructive="true"] { color: ${Ct}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${h(O("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${A}; }
.oc-sdk-popup-empty { color: ${A}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${j}; border-radius: 4px; color: ${w}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${h(w,60,j)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${j}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${V}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${F}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Po} }
.oc-sdk-check-desc { color: ${A}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${h(w,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${A}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${w}; }
.oc-sdk-tab[aria-selected="true"] { color: ${Ut}; background: ${It}; border-color: ${j}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${re}; background: var(--oc-sdk-raised-bg); ${Lt} }
.oc-sdk-tab-count { color: ${A}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${h(w,6)}; color: ${A}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${h("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${v}; }
.oc-sdk-row[aria-selected="true"] { background: ${It}; color: ${Ut}; }
.oc-sdk-row-lead { font-family: ${vt}; color: ${A}; }
.oc-sdk-row-sub { color: ${A}; }
.oc-sdk-row-meta { color: ${A}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${A}; }

.oc-sdk-empty-body { color: ${A}; }

.oc-sdk-spinner { color: ${A}; }
.oc-sdk-spinner-ring { border-color: ${j}; border-top-color: ${F}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${h("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${A}; }

.oc-sdk-separator { color: ${A}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${h(j,40)}; }

.oc-sdk-progress-label { color: ${A}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${h(w,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${F}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${O("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${O("success-text","inherit")}; }

.oc-sdk-text a { color: ${yt}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${h(j,60)}; }
`,U=`
${qe}
${dr}
${Xo}`;var Ho="oc-sdk-ui-style";var y=(e)=>{let r=document.getElementById(Ho);if(r instanceof HTMLStyleElement){if(r.textContent!==e)r.textContent=e;return}et(document);let n=document.createElement("style");n.id=Ho,n.textContent=e,document.head.appendChild(n)},R=(e,r)=>{let n=document.createElement(e);if(r)n.className=r;return n},K=(e)=>{let r=R("button",e);return r.type="button",r},P=(e,r)=>{let n=r??"";if(e.textContent!==n)e.textContent=n},W=(e,r,n)=>{if(n===void 0||n===null||n==="")e.removeAttribute(r);else if(e.getAttribute(r)!==n)e.setAttribute(r,n)};var lr=()=>{let e=document.createElement("span");return e.className="oc-sdk-spinner-ring",e.setAttribute("aria-hidden","true"),e},ne=(e,r)=>{y(U);let n=r,d=K("oc-sdk oc-sdk-btn"),l=lr(),T=document.createElement("span");d.append(T),e.append(d);let I=()=>{if(d.dataset.variant=n.variant??"default",d.dataset.size=n.size??"default",d.disabled=Boolean(n.disabled)||Boolean(n.loading),d.dataset.loading=n.loading?"true":"false",d.setAttribute("aria-busy",n.loading?"true":"false"),n.loading&&l.parentNode!==d)d.prepend(l);else if(!n.loading&&l.parentNode===d)l.remove();P(T,n.label)},x=()=>{if(n.disabled||n.loading)return;n.onClick()};return d.addEventListener("click",x),I(),{update:(N)=>{n={...n,...N},I()},dispose:()=>{d.removeEventListener("click",x),d.remove()}}};var Pt=(e,r)=>{y(U);let n=r,d=R("label","oc-sdk oc-sdk-field"),l=R("span","oc-sdk-field-label"),T=n.multiline?R("textarea","oc-sdk-input"):R("input","oc-sdk-input"),I=R("span","oc-sdk-field-note");d.append(l,T,I),e.append(d);let x=()=>{if(P(l,n.label),l.hidden=!n.label,T instanceof HTMLInputElement)T.type=n.password?"password":"text";else T.rows=n.rows??3;if(T.value!==n.value)T.value=n.value;T.disabled=Boolean(n.disabled),W(T,"placeholder",n.placeholder),T.dataset.mono=n.mono?"true":"false";let M=Boolean(n.error);d.dataset.invalid=M?"true":"false",T.setAttribute("aria-invalid",M?"true":"false");let B=n.error??n.helper??"";P(I,B),I.hidden=B===""},N=()=>{n.onChange(T.value)};return T.addEventListener("input",N),x(),{update:(M)=>{n={...n,...M},x()},dispose:()=>{T.removeEventListener("input",N),d.remove()}}};var Te={back:"M7.828 11H20v2H7.828l5.364 5.364-1.414 1.414L4 12l7.778-7.778 1.414 1.414z",forward:"M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z",reload:"M5.463 4.433A9.961 9.961 0 0 1 12 2c5.523 0 10 4.477 10 10 0 2.136-.67 4.116-1.81 5.74L17 12h3A8 8 0 0 0 6.46 6.228l-.997-1.795zm13.074 15.134A9.961 9.961 0 0 1 12 22C6.477 22 2 17.523 2 12c0-2.136.67-4.116 1.81-5.74L7 12H4a8 8 0 0 0 13.54 5.772l.997 1.795z",stop:"M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95L7.05 5.636z"},Tr=(e)=>{let r=document.createElementNS("http://www.w3.org/2000/svg","svg");r.setAttribute("viewBox","0 0 24 24"),r.setAttribute("width","16"),r.setAttribute("height","16"),r.setAttribute("aria-hidden","true"),r.style.fill="currentColor";let n=document.createElementNS("http://www.w3.org/2000/svg","path");return n.setAttribute("d",e),r.append(n),r},Ke=bt(),$o=document.querySelector("#root");if(!$o)throw Error("Missing #root");var ie=document.createElement("div");ie.style.cssText="display:flex;align-items:center;gap:2px;height:100%;padding:0 8px;box-sizing:border-box;";$o.append(ie);var Xt=(e,r,n)=>{let d=ne(ie,{label:"",variant:"ghost",size:"xs",onClick:n}),l=ie.lastElementChild;l.setAttribute("aria-label",e),l.title=e,l.style.padding="0 6px";let T=Tr(r);return l.prepend(T),{disable:(I)=>d.update({disabled:I}),swap:(I,x)=>{T.firstElementChild?.setAttribute("d",I),l.setAttribute("aria-label",x),l.title=x}}},Se=()=>{try{window.parent.focus()}catch{}},J=null,Gt=!1,je=async(e,r)=>{try{let n=await Ke.serviceRequest({method:"POST",path:e,body:JSON.stringify(r??{})}),d=JSON.parse(n.body||"{}");if(d.ok===!1&&d.error)Be(d.error,!0)}catch(n){Be(n instanceof Error?n.message:String(n),!0)}Dt()},Sr=Xt("Back",Te.back,()=>{Se(),je("/history",{direction:"back"})}),fr=Xt("Forward",Te.forward,()=>{Se(),je("/history",{direction:"forward"})}),Fo=Xt("Reload",Te.reload,()=>{Se(),je(J?.loading?"/stop":"/reload")}),ze=document.createElement("div");ze.style.cssText="flex:1;min-width:0;margin-left:6px;";ie.append(ze);var se="",Ht=Pt(ze,{value:"",placeholder:"Search Google or type a URL",onChange:(e)=>{se=e,Ht.update({value:e})}}),G=ze.querySelector("input");if(G)G.style.height="28px",G.spellcheck=!1,G.autocomplete="off",G.addEventListener("keydown",(e)=>{if(e.key==="Enter"&&se.trim())e.preventDefault(),G.blur(),Se(),je("/navigate",{url:se});else if(e.key==="Escape")e.preventDefault(),se=J?.url==="about:blank"?"":J?.url??"",Ht.update({value:se}),G.blur(),Se()}),G.addEventListener("focus",()=>G.select());var Ee=document.createElement("span");Ee.style.cssText="flex:none;max-width:40%;margin-left:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px/1.4 var(--oc-font);color:var(--oc-muted);";ie.append(Ee);var Bo=null,Be=(e,r=!1)=>{Bo=r?e:null,Ee.textContent=e,Ee.title=e,Ee.style.color=r?"var(--oc-error-text, var(--oc-error))":"var(--oc-muted)"},Or=(e)=>{switch(e.phase){case"preparing":{let r=e.progress;if(r?.step==="downloading"){let n=(d)=>Math.round(d/1048576);return r.total?`Downloading CloakBrowser ${n(r.received)}/${n(r.total)} MB`:"Downloading CloakBrowser"}if(r?.step==="verifying")return"Checking the download";if(r?.step==="unpacking")return"Unpacking CloakBrowser";return"Preparing"}case"starting":return"Starting";case"failed":return e.error??"The browser stopped";case"running":return e.loading?"Loading":"";default:return""}},Ar=(e)=>{if(J=e,Sr.disable(!e.canGoBack||e.phase!=="running"),fr.disable(!e.canGoForward||e.phase!=="running"),Fo.disable(e.phase!=="running"),Fo.swap(e.loading?Te.stop:Te.reload,e.loading?"Stop":"Reload"),G&&document.activeElement!==G){let r=e.url==="about:blank"?"":e.url;if(G.value!==r)Ht.update({value:r}),se=r}if(!Bo||e.phase==="failed")Be(Or(e),e.phase==="failed")},Dt=async()=>{if(Gt)return;Gt=!0;try{let e=await Ke.serviceRequest({method:"GET",path:"/state"});Ar(JSON.parse(e.body))}catch{Be("The Cloak Browser service is not running",!0)}finally{Gt=!1}},Ko=()=>{let e=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent);Ke.serviceRequest({method:"POST",path:"/viewer",body:JSON.stringify({dpr:window.devicePixelRatio||1,mac:e})}).catch(()=>{})},jo=()=>{matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`).addEventListener("change",()=>{Ko(),jo()},{once:!0})},Vo=!1;Ke.onReady((e)=>{if(kt(e,document.documentElement),Vo)return;Vo=!0,Ko(),jo(),Dt();let r=()=>{let n=!J||J.phase!=="running"||J.loading;setTimeout(()=>{Dt().finally(r)},n?400:1200)};r()});})();
