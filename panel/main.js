(()=>{var p="openchamber.sdk",u=1;var Ve=`
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
`;function Dt(e){let r=e.documentElement;if(r.hasAttribute("data-oc-scrollbar-activity"))return;r.setAttribute("data-oc-scrollbar-activity","");let c=new WeakMap;e.addEventListener("scroll",(x)=>{let _=x.target===e?r:x.target;if(!(_ instanceof Element))return;if(!_.hasAttribute("data-oc-scrolling"))_.setAttribute("data-oc-scrolling","");let k=c.get(_);if(k!==void 0)clearTimeout(k);c.set(_,setTimeout(()=>{c.delete(_),_.removeAttribute("data-oc-scrolling")},1000))},{capture:!0,passive:!0})}var yo=`(${Dt.toString()})(document);`;var $e=128,Be=65536;var fe=128;var Oe=65536;var Vt=/^[a-z][a-z0-9-]{0,39}$/;var Xt=(e)=>Object(e)===e&&!Array.isArray(e),Ke=(e,r)=>Object.keys(e).every((c)=>r.includes(c)),Ht=(e)=>String(e)===e&&e.length>=1&&e.length<=60,Ft=(e)=>String(e)===e&&e.length>=1&&e.length<=80,$t=(e)=>{if(!Array.isArray(e)||e.length>4)return!1;let r=new Set;for(let c of e){if(!Xt(c)||!Vt.test(c.id)||!Ht(c.label))return!1;if(c.disabled!==void 0&&c.disabled!==!0&&c.disabled!==!1)return!1;if(r.has(c.id))return!1;if(r.add(c.id),c.kind==="button"){if(!Ke(c,["kind","id","label","disabled"]))return!1;continue}if(c.kind!=="select"||!Ke(c,["kind","id","label","value","options","disabled"]))return!1;if(!Ft(c.value)||!Array.isArray(c.options)||c.options.length<1||c.options.length>16)return!1;let x=new Set;for(let _ of c.options){if(!Xt(_)||!Ke(_,["value","label"])||!Ft(_.value)||!Ht(_.label)||x.has(_.value))return!1;x.add(_.value)}if(!x.has(c.value))return!1}return!0};var Bt=["{id}","{segment}","{segments+}"];var sr=new Set(Bt);var Kt=["turn-finished","turn-failed","permission-asked","question-asked"];var ar=new Set(Kt);var Ae=20000000,he=256;var je=(e)=>("bytes"in e)?e.bytes.byteLength:e.content.length,jt=(e,r)=>{if(e.path!==r.path||e.readOnly!==r.readOnly)return!1;if(e.encoding==="text"||r.encoding==="text")return e.encoding==="text"&&r.encoding==="text"&&e.content===r.content;if(e.bytes.byteLength!==r.bytes.byteLength)return!1;for(let c=0;c<e.bytes.byteLength;c+=1)if(e.bytes[c]!==r.bytes[c])return!1;return!0};var zt=/^[A-Za-z0-9_-]{1,80}$/;var Wt=["left","right","top","bottom"];var Jt=(e,r=0,c={remaining:16000})=>{if(--c.remaining<0||r>=32)return!1;if(e===null)return!0;let x=Array.isArray(e)?e:Object(e)===e?Object.values(e):[];for(let _ of x)if(!Jt(_,r+1,c))return!1;return!0},ze=(e)=>{if(e===null||e===!0||e===!1)return!0;if(Array.isArray(e))return Object.keys(e).every((r)=>/^(0|[1-9]\d*)$/.test(r)&&Number(r)<e.length)&&e.every(ze);if(Object(e)===e){let r=Object.getPrototypeOf(e);return(r===null||r===Object.prototype)&&Object.values(e).every(ze)}return String(e)===e||Number.isFinite(e)},We=(e)=>{try{if(String(e.id)!==e.id||!zt.test(e.id)||!Number.isFinite(e.anchor.x)||Math.abs(e.anchor.x)>1e5||!Number.isFinite(e.anchor.y)||Math.abs(e.anchor.y)>1e5||!Number.isFinite(e.anchor.width)||!Number.isFinite(e.anchor.height)||e.anchor.width<=0||e.anchor.height<=0||e.anchor.width>1e5||e.anchor.height>1e5||!Number.isInteger(e.width)||e.width<160||e.width>640||!Number.isInteger(e.height)||e.height<48||e.height>480||e.side!==void 0&&!Wt.includes(e.side)||e.focus!==void 0&&e.focus!==!0&&e.focus!==!1||!Jt(e.data)||!ze(e.data))return!1;return JSON.stringify(e.data).length<=16000}catch{return!1}};var Qt=["file","directory","other","missing"],Ye=(e)=>Boolean(e&&"sessionId"in e),Qe=(e)=>Boolean(e&&"sent"in e&&!("sessionId"in e));var Zt=/^[0-9a-f]{7,64}$/i,Ze=(e)=>Zt.test(e),me=500,Re=32000,qt=16000,eo=128,to=200,oo=2000,ro=16000,no=80,so=200,io=16000;var ao=2000;var qe=20000,xe=1024,be=2000000;var ge=64000,ke=8000,et=4000;var tt=960000;var co=999,lo=1e4,ae=500,po=["HOST_UNAVAILABLE","HOST_TIMEOUT","HOST_REJECTED","DISCONNECTED","DISABLED","BAD_PATH","NO_INTEGRATION","NO_SERVICE","SERVICE_FAILED","REQUEST_FAILED","RESPONSE_TOO_LARGE","NO_SESSION","SESSION_BUSY","NOT_GRANTED","NO_DIRECTORY","NOT_FOUND","FILE_TOO_LARGE","DENIED","NO_MODEL","MODEL_FAILED","UNSUPPORTED"],uo=["stopped","starting","ready","failed"],No=new Set(po),_o=(e)=>No.has(e),Eo=(e)=>e&&_o(e)?e:"HOST_REJECTED",J=(e)=>{if(e===void 0)return!1;if(e===null||e===!0||e===!1)return!0;if(String(e)===e)return!0;if(Number(e)===e)return Number.isFinite(e);if(Array.isArray(e))return e.every(J);if(Object(e)===e)return Object.values(e).every(J);return!1},To=(e)=>J(e)&&JSON.stringify(e).length<=io,Yt=(e)=>e?.trim().slice(0,so)??"",Y=(e)=>{let r=e.id.trim().slice(0,eo),c=e.title.trim().slice(0,to),x=e.url.trim().slice(0,oo),_=e.text?.trim().slice(0,ro),k=e.author?.trim().slice(0,no),X=e.kind==="pull"?"pull":"issue",v={providerId:e.providerId.trim(),id:r,title:c||r,url:x,kind:X};if(_)v.text=_;if(k)v.author=k;if(X==="pull"){let H=Yt(e.branches?.head),F=Yt(e.branches?.base);if(H&&F)v.branches={head:H,base:F}}if(To(e.data))v.data=e.data;return v},ot=(e)=>{let r=Y(e);if(e.projectId)r.projectId=e.projectId;if(e.navigation)r.navigation=e.navigation;if(e.worktree)r.worktree=e.worktree;return r},rt=(e)=>{let r={text:e.text.trim().slice(0,qt)};if(e.send)r.send=!0;return r},nt=(e)=>{if(e===null||!Number.isFinite(e))return null;return Math.min(co,Math.max(0,Math.round(e)))},st=(e)=>{if(!Number.isFinite(e))return 0;return Math.min(lo,Math.max(0,Math.ceil(e)))};var Q=(e)=>e.length>0&&e.length<=xe&&!e.includes("\x00")&&!e.includes("\\");var Ie=(e)=>{if(!e.startsWith("/")||e.includes("\x00")||e.includes("\\")||e.includes("://"))return!1;if(e.length>ao)return!1;return!e.split("/").some((c)=>c==="."||c==="..")},vo=new Set(uo),it=(e)=>Boolean(e&&"status"in e&&vo.has(String(e.status))&&!("body"in e)),Ue=(e)=>Boolean(e&&"status"in e&&"body"in e&&Number.isInteger(e.status)),at=(e)=>Boolean(e&&"content"in e&&String(e.content)===e.content),ct=(e)=>Boolean(e&&"written"in e&&e.written===!0),dt=(e)=>Boolean(e&&"entries"in e&&Array.isArray(e.entries)),Mo=new Set(Qt),lt=(e)=>Boolean(e&&"kind"in e&&"size"in e&&Mo.has(String(e.kind))&&Number.isFinite(e.size)),pt=(e)=>Boolean(e&&"text"in e&&String(e.text)===e.text&&!("status"in e)),Lo=new Set(["workspace","shells","ready","directory","session","connection","settings","session-lifecycle","item","resolve","action","status-control-event","popover-closed","file-open","file-snapshot","file-saved","generate-late"]),wo=(e)=>Object(e)===e?e:null,Je=(e)=>String(e)===e&&e.length>0,Po=(e)=>{if(!Je(e.id))return null;if(e.ok===!0){let r={channel:p,v:u,type:"result",id:e.id,ok:!0};if(Object(e.payload)===e.payload)r.payload=e.payload;return r}if(e.ok===!1&&Je(e.error))return{channel:p,v:u,type:"result",id:e.id,ok:!1,error:e.error,code:Eo(Je(e.code)?e.code:void 0)};return null},ut=(e)=>{let r=wo(e);if(!r||r.channel!==p||r.v!==u)return null;if(r.type==="result")return Po(r);if(!Lo.has(String(r.type))||Object(r.payload)!==r.payload)return null;return r};var So=(e)=>("key"in e)&&("metaKey"in e)&&("ctrlKey"in e),Go=(e)=>(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==="s";class i extends Error{code;constructor(e,r){super(r);this.name="HostRequestError",this.code=e}}var fo=()=>Promise.reject(new i("BAD_PATH",'Request path must start with "/" and stay on the declared origin.')),ye=()=>Promise.reject(new i("BAD_PATH",`File path must be 1 to ${xe} characters without NUL or backslash.`)),Ce=(e)=>{if(e===void 0)return;if(Object(e)!==e||Array.isArray(e)||e.scope!==void 0&&e.scope!=="instance"&&e.scope!=="device")throw new i("HOST_REJECTED",'Storage scope must be "instance" or "device".');return e.scope==="device"?"device":void 0},l=(e)=>(e.value+=1,`oc-${e.value}`),_t=(e={})=>{let r=e.target??("window"in globalThis?window:null);if(!r)throw new i("HOST_UNAVAILABLE","No window. connectHost runs in a browser frame.");let c=e.acceptSource??((t)=>t===r.parent),x=e.requestTimeoutMs??qe,_=new Set,k=new Set,X=new Set,v=new Set,H=new Set,F=new Set,ee=new Set,le=new Set,pe=new Set,K=new Set,Ge=[],te=null,oe=null,ue=new Set,_e=new Set,re=null,ne=null,De=!1,j=new Map,z=new Map,W=new Map,L=!1,d={value:0},a=null,w=null,se=!1,ie=!1,kt=null,It=(t)=>{if(!t)return null;return{sessionId:t.id,phase:t.busy?"started":"completed"}},C=(t)=>{r.parent.postMessage(t,"*")},Ut=()=>{if(L||r.parent===r||K.size===0||a?.features?.lateGenerateResults!==!0)return;C({channel:p,v:u,type:"generate-late-listen"})},A=(t,o)=>{for(let n of t)try{n(o)}catch(s){console.error(s)}},yt=(t)=>{if(!(t instanceof MessageEvent))return;if(!c(t.source))return;let o=ut(t.data);if(!o)return;if(o.type==="workspace"){let s=z.get(o.payload.subscriptionId);if(s)A([s],o.payload.snapshot);return}if(o.type==="shells"){let s=W.get(o.payload.subscriptionId);if(s)A([s],o.payload.snapshot);return}if(o.type==="ready"){if(a=o.payload,w=It(o.payload.session),A(_,o.payload),A(k,o.payload.directory),A(X,o.payload.session),w)A(v,w);A(H,o.payload.connection),A(F,o.payload.settings),A(ee,o.payload.item),Ut();return}if(o.type==="generate-late"){if(K.size===0)Ge.push(o.payload);else A(K,o.payload);return}if(o.type==="directory"){if(a)a={...a,directory:o.payload.directory};A(k,o.payload.directory);return}if(o.type==="session"){if(a)a={...a,session:o.payload.session};if(!o.payload.session)w=null;else if(w?.sessionId!==o.payload.session.id)w=It(o.payload.session);A(X,o.payload.session);return}if(o.type==="session-lifecycle"){w=o.payload,A(v,o.payload);return}if(o.type==="connection"){if(a)a={...a,connection:o.payload.connection};A(H,o.payload.connection);return}if(o.type==="settings"){if(a)a={...a,settings:o.payload.settings};A(F,o.payload.settings);return}if(o.type==="item"){if(a)a={...a,item:o.payload.item};A(ee,o.payload.item);return}if(o.type==="status-control-event"){A(le,o.payload);return}if(o.type==="popover-closed"){A(pe,o.payload);return}if(o.type==="action"){let s=(E)=>{if(!L)C({channel:p,v:u,type:"action-result",id:o.id,payload:E})},T=oe;if(!T){s({ok:!1,error:"This extension does not handle background actions."});return}Promise.resolve().then(()=>T(o.payload)).then(()=>s({ok:!0}),(E)=>{let R=(E instanceof Error?E.message:String(E)).trim();s({ok:!1,error:(R||"Action failed.").slice(0,ae)})});return}if(o.type==="file-open"){let s=o.payload;if(ne&&jt(ne,s))return;ne=s,A(ue,o.payload);return}if(o.type==="file-saved"){A(_e,o.payload.version);return}if(o.type==="file-snapshot"){let s=(R)=>{if(!L)C({channel:p,v:u,type:"file-snapshot-result",id:o.id,payload:R})},T=(R)=>s({error:(R.trim()||"Could not read the edited file.").slice(0,ae)}),E=re;if(!E){T("This extension does not edit files.");return}Promise.resolve().then(()=>E(o.payload.purpose)).then((R)=>{if(je(R)>Ae){T(`The file is over ${Ae} ${"bytes"in R?"bytes":"characters"}.`);return}if(R.version.length>he){T(`The snapshot version is over ${he} characters.`);return}s({snapshot:"bytes"in R?{bytes:R.bytes,version:R.version}:{content:R.content,version:R.version}})},(R)=>T(R instanceof Error?R.message:String(R)));return}if(o.type==="resolve"){let s=(E)=>{C({channel:p,v:u,type:"resolve-result",id:o.id,payload:E})},T=te;if(!T){s({error:"This extension does not resolve commands."});return}Promise.resolve().then(()=>T(o.payload)).then((E)=>s({item:E?Y(E):null}),(E)=>{let R=(E instanceof Error?E.message:String(E)).trim();s({error:(R||"Command failed.").slice(0,ae)})});return}let n=j.get(o.id);if(!n)return;if(clearTimeout(n.timer),j.delete(o.id),o.ok){n.resolve(o.payload);return}n.reject(new i(o.code,o.error))};r.addEventListener("message",yt),C({channel:p,v:u,type:"hello"});let b=(t,o=x)=>{if(L||r.parent===r)return Promise.reject(new i("HOST_UNAVAILABLE","No host frame. This page is not in an iframe."));return new Promise((n,s)=>{let T=setTimeout(()=>{j.delete(t.id),s(new i("HOST_TIMEOUT","Host did not answer in time."))},o);j.set(t.id,{resolve:n,reject:s,timer:T}),C(t)})},h=(t)=>b(t).then(()=>{return}),m={channel:p,v:u},Xe=(t)=>{if(!L&&r.parent!==r)C(t)},Ct=()=>Xe({...m,type:"file-save"}),Nt=(t)=>{if(!So(t)||!Go(t))return;t.preventDefault(),Ct()},vt=(t)=>{if(!So(t)||t.key!=="Escape"||a?.surface!=="popover"||!a.popover)return;t.preventDefault(),Pt(a.popover.id,"escape").catch(()=>{return})},Ee=()=>{let t=a?.surface==="popover"?a.popover:void 0;if(!t)return;let o=se||ie;if(kt===o)return;kt=o,Gt(t.id,o).catch(()=>{return})},Te=()=>{if(a?.surface!=="popover"||se)return;se=!0,Ee()},Mt=(t)=>{if(a?.surface!=="popover"||t.relatedTarget!==null||!se)return;se=!1,Ee()},Lt=()=>{if(a?.surface!=="popover"||ie)return;ie=!0,Ee()},wt=()=>{if(a?.surface!=="popover"||!ie)return;ie=!1,Ee()},M=(t,o=1024)=>{if(!t.trim()||t.length>o)throw new i("HOST_REJECTED",`Identity must contain 1 to ${o} characters.`)},He=async(t)=>{if(t.kind!=="projects")M(t.projectId);let o=await b({...m,type:"workspace-read",id:l(d),payload:t});if(!o||!("kind"in o)||!("state"in o)||o.kind!==t.kind)throw new i("HOST_REJECTED","Host did not return workspace data.");return o},Fe=async(t,o)=>{if(t.kind!=="projects")M(t.projectId);let n=l(d);z.set(n,o);try{await h({...m,type:"workspace-subscribe",id:l(d),payload:{subscriptionId:n,query:t}})}catch(s){if(z.delete(n),!L)C({...m,type:"workspace-unsubscribe",id:l(d),payload:{subscriptionId:n}});throw s}return()=>{if(!z.delete(n)||L)return;C({...m,type:"workspace-unsubscribe",id:l(d),payload:{subscriptionId:n}})}},Uo=async(t,o)=>{if(t.kind==="session")M(t.sessionId);if(t.kind==="project")M(t.projectId);let n=l(d);W.set(n,o);try{await h({...m,type:"shells-subscribe",id:l(d),payload:{subscriptionId:n,scope:t}})}catch(s){if(W.delete(n),!L)C({...m,type:"shells-unsubscribe",id:l(d),payload:{subscriptionId:n}});throw s}return()=>{if(!W.delete(n)||L)return;C({...m,type:"shells-unsubscribe",id:l(d),payload:{subscriptionId:n}})}},Se=async(t)=>{if("key"in t&&(t.key.length===0||t.key.length>$e))throw new i("HOST_REJECTED","Storage key must contain 1 to 128 characters.");if(t.op==="set"&&!J(t.value))throw new i("HOST_REJECTED","Storage values must be JSON.");if(t.op==="set"&&new TextEncoder().encode(JSON.stringify(t.value)).length>Be)throw new i("HOST_REJECTED","Storage value exceeds 64 KiB.");if(t.scope==="device"&&a?.features?.deviceStorage!==!0)throw new i("UNSUPPORTED","This host does not support device storage.");let o=await b({...m,type:"storage",id:l(d),payload:t});if(!o||!("storage"in o)||o.op!==t.op)throw new i("HOST_REJECTED","Host did not return storage data.");return o},Pt=(t,o)=>a?.features?.popovers!==!0&&!(a?.surface==="popover"&&a.popover?.id===t)?Promise.reject(new i("UNSUPPORTED","This host does not support popovers.")):h({...m,type:"popover-close",id:l(d),payload:o?{id:t,reason:o}:{id:t}}),Gt=(t,o)=>a?.features?.popovers!==!0&&!(a?.surface==="popover"&&a.popover?.id===t)?Promise.reject(new i("UNSUPPORTED","This host does not support popovers.")):h({...m,type:"popover-anchor",id:l(d),payload:{id:t,active:o}});return r.addEventListener("keydown",vt,!0),r.addEventListener("pointerover",Te),r.addEventListener("pointermove",Te),r.addEventListener("pointerout",Mt),r.addEventListener("focus",Lt),r.addEventListener("blur",wt),{onAction:(t)=>(oe=t,()=>{if(oe===t)oe=null}),listProjects:async()=>{let t=await He({kind:"projects"});if(t.kind!=="projects")throw new i("HOST_REJECTED","Expected projects.");return t},listWorktrees:async(t)=>{let o=await He({kind:"worktrees",projectId:t});if(o.kind!=="worktrees")throw new i("HOST_REJECTED","Expected worktrees.");return o},listSessions:async(t)=>{let o=await He({kind:"sessions",projectId:t});if(o.kind!=="sessions")throw new i("HOST_REJECTED","Expected sessions.");return o},onProjects:(t)=>Fe({kind:"projects"},(o)=>{if(o.kind==="projects")t(o)}),onWorktrees:(t,o)=>Fe({kind:"worktrees",projectId:t},(n)=>{if(n.kind==="worktrees")o(n)}),onSessions:(t,o)=>Fe({kind:"sessions",projectId:t},(n)=>{if(n.kind==="sessions")o(n)}),onRunningShells:(t,o)=>Uo(t,o),readShellOutput:async(t,o)=>{M(t,fe);let n=o?.cursor;if(n!==void 0&&(!Number.isInteger(n)||n<0))throw new i("HOST_REJECTED","Shell output cursor must be a non-negative integer.");let s=o?.tailBytes;if(s!==void 0&&(!Number.isInteger(s)||s<1||s>Oe))throw new i("HOST_REJECTED",`Shell output tailBytes must be an integer between 1 and ${Oe}.`);let E=await b({...m,type:"shell-output",id:l(d),payload:{shellId:t,cursor:n,tailBytes:s}});if(!E||typeof E.output!=="string"||!Number.isFinite(E.cursor))throw new i("HOST_REJECTED","Host did not return shell output.");return E},stopShell:async(t)=>{if(M(t,fe),(await b({...m,type:"shell-stop",id:l(d),payload:{shellId:t}}))?.stopped!==!0)throw new i("HOST_REJECTED","Host did not stop the shell.");return{stopped:!0}},openSession:async(t)=>{M(t),await h({...m,type:"open-session",id:l(d),payload:{sessionId:t}})},storage:{get:async(t,o)=>{let n=Ce(o),s={op:"get",key:t};if(n)s.scope=n;let T=await Se(s);return T.op==="get"&&T.found?T.value:void 0},set:async(t,o,n)=>{let s=Ce(n),T={op:"set",key:t,value:o};if(s)T.scope=s;await Se(T)},delete:async(t,o)=>{let n=Ce(o),s={op:"delete",key:t};if(n)s.scope=n;await Se(s)},keys:async(t)=>{let o=Ce(t),n={op:"keys"};if(o)n.scope=o;let s=await Se(n);if(s.op!=="keys")throw new i("HOST_REJECTED","Expected storage keys.");return s.keys}},onReady:(t)=>{if(_.add(t),a)t(a);return()=>{_.delete(t)}},onDirectory:(t)=>{if(k.add(t),a)t(a.directory);return()=>{k.delete(t)}},onSession:(t)=>{if(X.add(t),a)t(a.session);return()=>{X.delete(t)}},onSessionLifecycle:(t)=>{if(v.add(t),w)t(w);return()=>{v.delete(t)}},onConnection:(t)=>{if(H.add(t),a)t(a.connection);return()=>{H.delete(t)}},onSettings:(t)=>{if(F.add(t),a)t(a.settings);return()=>{F.delete(t)}},onItem:(t)=>{if(ee.add(t),a)t(a.item);return()=>{ee.delete(t)}},onStatusControl:(t)=>(le.add(t),()=>{le.delete(t)}),onPopoverClosed:(t)=>(pe.add(t),()=>{pe.delete(t)}),setStatusControls:(t)=>{if(a?.features?.statusControls!==!0)return Promise.reject(new i("UNSUPPORTED","This host does not support status controls."));if(!$t(t))return Promise.reject(new i("HOST_REJECTED","Status controls must have unique bounded ids and valid selected options."));return h({...m,type:"status-controls",id:l(d),payload:{controls:t}})},openPopover:(t)=>{if(a?.features?.popovers!==!0)return Promise.reject(new i("UNSUPPORTED","This host does not support popovers."));if(!We(t))return Promise.reject(new i("HOST_REJECTED","Popover requests need bounded geometry and JSON data."));return h({...m,type:"popover-open",id:l(d),payload:t})},closePopover:Pt,setPopoverAnchorActive:Gt,onResolve:(t)=>(te=t,()=>{if(te===t)te=null}),toast:(t)=>{let o=t.message.trim();if(!o||o.length>me)return Promise.reject(new i("HOST_REJECTED",`Toast message must contain 1 to ${me} characters.`));if(t.copy&&t.copy!==!0&&(!t.copy.text.length||t.copy.text.length>Re))return Promise.reject(new i("HOST_REJECTED",`Toast copy text must contain 1 to ${Re} characters.`));return h({channel:p,v:u,type:"toast",id:l(d),payload:{...t,message:o}})},openUrl:(t)=>h({channel:p,v:u,type:"open-url",id:l(d),payload:{url:t}}),openCommit:(t)=>Ze(t)?h({channel:p,v:u,type:"open-commit",id:l(d),payload:{sha:t}}):Promise.reject(new i("HOST_REJECTED","Commit id must be 7 to 64 hex characters.")),openSurface:(t)=>h({channel:p,v:u,type:"open-surface",id:l(d),payload:{surfaceId:t}}),writeClipboard:(t)=>h({channel:p,v:u,type:"clipboard-write",id:l(d),payload:{text:t}}),compose:(t)=>h({channel:p,v:u,type:"compose",id:l(d),payload:t}),attach:(t)=>h({channel:p,v:u,type:"attach",id:l(d),payload:Y(t)}),startSession:async(t)=>{if(t.projectId!==void 0)M(t.projectId);let o=t.worktree;if(o&&o!==!0)if(o.kind==="existing")M(o.directory);else{if(o.name!==void 0)M(o.name,200);if(o.baseBranch!==void 0)M(o.baseBranch,200)}let n=await b({channel:p,v:u,type:"start-session",id:l(d),payload:ot(t)},e.requestTimeoutMs??180000);if(!Ye(n))throw new i("HOST_REJECTED","Host did not return a session.");return n},prompt:(t)=>b({channel:p,v:u,type:"prompt",id:l(d),payload:rt(t)}).then((o)=>{if(!Qe(o))throw new i("HOST_REJECTED","Host did not return a prompt result.");return o}),sessionLink:(t)=>h({channel:p,v:u,type:"session-link",id:l(d),payload:Y(t)}),close:()=>h({channel:p,v:u,type:"close",id:l(d)}),oauthStart:()=>h({channel:p,v:u,type:"oauth-start",id:l(d)}),oauthDisconnect:()=>h({channel:p,v:u,type:"oauth-disconnect",id:l(d)}),request:(t)=>(Ie(t.path)?b({channel:p,v:u,type:"request",id:l(d),payload:t}):fo()).then((o)=>{if(!Ue(o))throw new i("HOST_REJECTED","Host request result was empty.");return o}),serviceRequest:(t)=>(Ie(t.path)?b({channel:p,v:u,type:"service-request",id:l(d),payload:t}):fo()).then((o)=>{if(!Ue(o))throw new i("HOST_REJECTED","Host service request result was empty.");return o}),serviceStatus:()=>b({channel:p,v:u,type:"service-status",id:l(d)}).then((t)=>{if(!it(t))throw new i("HOST_REJECTED","Host did not return service status.");return t}),readFile:(t)=>(Q(t)?b({channel:p,v:u,type:"file-read",id:l(d),payload:{path:t}}):ye()).then((o)=>{if(!at(o))throw new i("HOST_REJECTED","Host did not return file content.");return o}),writeFile:(t,o)=>{if(!Q(t))return ye();if(o.length>be)return Promise.reject(new i("FILE_TOO_LARGE",`Content is over ${be} characters.`));return b({channel:p,v:u,type:"file-write",id:l(d),payload:{path:t,content:o}}).then((n)=>{if(!ct(n))throw new i("HOST_REJECTED","Host did not confirm the write.");return n})},listDir:(t)=>(Q(t)?b({channel:p,v:u,type:"file-list",id:l(d),payload:{path:t}}):ye()).then((o)=>{if(!dt(o))throw new i("HOST_REJECTED","Host did not return directory entries.");return o}),stat:(t)=>(Q(t)?b({channel:p,v:u,type:"file-stat",id:l(d),payload:{path:t}}):ye()).then((o)=>{if(!lt(o))throw new i("HOST_REJECTED","Host did not return file status.");return o}),generate:(t)=>{let o=t.prompt.trim(),n=t.system?.trim();if(o.length===0||o.length>ge)return Promise.reject(new i("HOST_REJECTED",`Prompt must be 1 to ${ge} characters.`));if(n!==void 0&&(n.length===0||n.length>ke))return Promise.reject(new i("HOST_REJECTED",`System prompt must be 1 to ${ke} characters.`));let s=t.maxOutputTokens===void 0?void 0:Math.min(et,Math.max(1,Math.floor(t.maxOutputTokens)));if(s!==void 0&&!Number.isFinite(s))return Promise.reject(new i("HOST_REJECTED","maxOutputTokens must be a number."));let T={prompt:o};if(n!==void 0)T.system=n;if(s!==void 0)T.maxOutputTokens=s;return b({channel:p,v:u,type:"generate",id:l(d),payload:T},e.requestTimeoutMs??tt).then((E)=>{if(!pt(E))throw new i("HOST_REJECTED","Host did not return generated text.");return E})},onLateGenerateResult:(t)=>{K.add(t);for(let o of Ge.splice(0))A([t],o);return Ut(),()=>{K.delete(t)}},setBadge:(t)=>h({channel:p,v:u,type:"badge",id:l(d),payload:{count:nt(t)}}),setHeight:(t)=>h({channel:p,v:u,type:"resize",id:l(d),payload:{height:st(t)}}),onFileOpen:(t)=>{if(ue.add(t),!De)De=!0,r.addEventListener("keydown",Nt,!0);if(ne)t(ne);return()=>{ue.delete(t)}},onFileSnapshot:(t)=>(re=t,()=>{if(re===t)re=null}),onFileSaved:(t)=>(_e.add(t),()=>{_e.delete(t)}),reportFileChange:(t)=>Xe({...m,type:"file-change",payload:{dirty:t.dirty,edited:t.edited}}),requestFileSave:Ct,reportFileUnsupported:()=>Xe({...m,type:"file-unsupported"}),dispose:()=>{for(let t of z.keys())C({...m,type:"workspace-unsubscribe",id:l(d),payload:{subscriptionId:t}});z.clear();for(let t of W.keys())C({...m,type:"shells-unsubscribe",id:l(d),payload:{subscriptionId:t}});if(W.clear(),L=!0,te=null,oe=null,re=null,ue.clear(),_e.clear(),De)r.removeEventListener("keydown",Nt,!0);r.removeEventListener("message",yt),r.removeEventListener("keydown",vt,!0),r.removeEventListener("pointerover",Te),r.removeEventListener("pointermove",Te),r.removeEventListener("pointerout",Mt),r.removeEventListener("focus",Lt),r.removeEventListener("blur",wt);for(let t of j.values())clearTimeout(t.timer),t.reject(new i("HOST_UNAVAILABLE","Host client was disposed."));j.clear(),_.clear(),k.clear(),X.clear(),v.clear(),H.clear(),F.clear(),ee.clear(),le.clear(),pe.clear(),K.clear(),Ge.length=0}}};var Oo=["browser.open","browser.snapshot","browser.click","browser.type","browser.select","browser.scroll","browser.back","browser.forward","browser.inspect","browser.capture","browser.resize","browser.close"];var mr=new Set(Oo);var Ao=["none","agent","user"];var xr=new Set(Ao);var Do=[["--oc-bg","background"],["--oc-elevated","elevated"],["--oc-fg","foreground"],["--oc-muted","muted"],["--oc-subtle","subtle"],["--oc-border","border"],["--oc-hover","hover"],["--oc-selection","selection"],["--oc-focus","focus"],["--oc-primary","primary"],["--oc-muted-surface","mutedSurface"],["--oc-elevated-fg","elevatedForeground"],["--oc-active","active"],["--oc-selection-fg","selectionForeground"],["--oc-primary-fg","primaryForeground"],["--oc-primary-text","primaryText"],["--oc-success-text","successText"],["--oc-warning-text","warningText"],["--oc-error-text","errorText"],["--oc-info-text","infoText"],["--oc-success","success"],["--oc-warning","warning"],["--oc-error","error"],["--oc-info","info"],["--oc-font","font"],["--oc-mono","mono"],["--oc-radius","radius"],["--surface-background","background"],["--surface-elevated","elevated"],["--surface-foreground","foreground"],["--surface-muted-foreground","muted"],["--surface-subtle","subtle"],["--interactive-border","border"],["--interactive-hover","hover"],["--interactive-selection","selection"],["--interactive-focus-ring","focus"],["--primary","primary"],["--surface-muted","mutedSurface"],["--surface-elevated-foreground","elevatedForeground"],["--interactive-active","active"],["--interactive-selection-foreground","selectionForeground"],["--primary-foreground","primaryForeground"],["--primary-text","primaryText"],["--success-text","successText"],["--warning-text","warningText"],["--error-text","errorText"],["--info-text","infoText"],["--status-success","success"],["--status-warning","warning"],["--status-error","error"],["--status-info","info"],["--font-sans","font"],["--font-mono","mono"],["--radius","radius"]],Xo=[["--oc-syntax-keyword","--syntax-keyword","syntaxKeyword"],["--oc-syntax-string","--syntax-string","syntaxString"],["--oc-syntax-number","--syntax-number","syntaxNumber"],["--oc-syntax-function","--syntax-function","syntaxFunction"],["--oc-syntax-type","--syntax-type","syntaxType"],["--oc-syntax-comment","--syntax-comment","syntaxComment"],["--oc-syntax-variable","--syntax-variable","syntaxVariable"],["--oc-syntax-operator","--syntax-operator","syntaxOperator"]],ho=(e,r)=>{r.style.colorScheme=e.mode;for(let[c,x]of Do)r.style.setProperty(c,e.tokens[x]);for(let[c,x,_]of Xo){let k=e.tokens[_]??"";r.style.setProperty(c,k),r.style.setProperty(x,k)}r.style.setProperty("font-family",e.tokens.font),r.style.setProperty("font-size","0.875rem"),r.style.setProperty("line-height","1.45"),r.style.setProperty("color",e.tokens.foreground)},Et=(e,r)=>{if(ho(e.theme,r),r.dataset)r.dataset.ocSurface=e.surface,r.dataset.ocTheme=e.theme.mode};var Ho={"surface-background":"bg","surface-elevated":"elevated","surface-elevated-foreground":"elevated-fg","surface-foreground":"fg","surface-muted-foreground":"muted","surface-muted":"muted-surface","surface-subtle":"subtle","interactive-border":"border","interactive-hover":"hover","interactive-active":"active","interactive-selection":"selection","interactive-selection-foreground":"selection-fg","interactive-focus-ring":"focus",primary:"primary","primary-foreground":"primary-fg","primary-text":"primary-text","success-text":"success-text","warning-text":"warning-text","error-text":"error-text","info-text":"info-text","status-success":"success","status-warning":"warning","status-error":"error","status-info":"info","font-sans":"font","font-mono":"mono",radius:"radius"},S=(e,r)=>`var(--${e}, var(--oc-${Ho[e]}, ${r}))`,G=S("surface-background","transparent"),ve=S("surface-elevated","transparent"),Z=S("surface-elevated-foreground","inherit"),N=S("surface-foreground","inherit"),f=S("surface-muted-foreground","gray"),Fo=S("surface-muted","transparent"),V=S("interactive-border","currentColor"),I=S("interactive-hover","transparent"),B=S("interactive-active","transparent"),Tt=S("interactive-selection","transparent"),St=S("interactive-selection-foreground","inherit"),P=S("primary","currentColor"),ft=S("primary-text","inherit"),Ot=S("error-text","inherit"),Vo=S("font-sans","inherit"),At=S("font-mono","monospace"),bo=S("radius","9px"),ht=`calc(${bo} - 2px)`,mo=`calc(${bo} - 4px)`,O=(e,r,c="transparent")=>`color-mix(in srgb, ${e} ${r}%, ${c})`,Ro=`background-image: linear-gradient(${I}, ${I});`,mt=(e,r="0.5px")=>`box-shadow: inset 0 0 0 ${r} ${e}, var(--oc-sdk-field-lift);`,Rt="border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);",xo="box-shadow: var(--oc-sdk-lit);",xt=`inset 0 0.5px 0 0 ${O(N,8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`,$o=`
:root {
  --oc-sdk-edge: ${O(N,16)};
  --oc-sdk-field-bg: ${ve};
  --oc-sdk-raised-bg: ${G};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${O(N,14)};
  --oc-sdk-field-bg: ${O(G,50,ve)};
  --oc-sdk-raised-bg: ${ve};
  --oc-sdk-field-lift: ${xt};
  --oc-sdk-raised-lift: ${xt};
  --oc-sdk-lit: ${xt};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`,Ne=(e)=>{let r=S(`status-${e}`,"currentColor");return`
.oc-sdk[data-tone="${e}"], .oc-sdk [data-tone="${e}"] { --oc-sdk-tone: ${r}; --oc-sdk-tone-text: ${S(`${e}-text`,"inherit")}; }`},Bo=`
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
`,go=`${$o}
.oc-sdk { color: ${N}; font-family: ${Vo}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${Ro} }
.oc-sdk-mono { font-family: ${At}; }
.oc-sdk-muted { color: ${f}; }
${Ne("success")}${Ne("warning")}${Ne("error")}${Ne("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${P}; --oc-sdk-tone-text: ${ft}; }

.oc-sdk-btn { border-radius: ${ht}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${mo}; }
.oc-sdk-btn[data-variant="default"] { color: ${ft}; background: ${O(P,10,G)}; border-color: ${O(P,12)}; ${xo} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${O(P,16,G)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${O(P,22,G)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${Fo}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${B}, ${B}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${Z}; ${Rt} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${B}, ${B}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${I}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${B}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${S("status-error","red")}; color: ${Ot}; background: ${O("var(--oc-sdk-tone)",7,G)}; border-color: ${O("var(--oc-sdk-tone)",12)}; ${xo} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${O("var(--oc-sdk-tone)",9,G)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${O("var(--oc-sdk-tone)",11,G)}; box-shadow: none; }

.oc-sdk-field-note { color: ${f}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${Ot}; }
.oc-sdk-input { border-radius: ${ht}; background: var(--oc-sdk-field-bg); color: ${Z}; ${mt("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${f}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${mt(O(N,26),"1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${mt(S("status-error","red"),"1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${At}; }

.oc-sdk-search-icon { color: ${f}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${P}; }
.oc-sdk-search-clear { border-radius: ${mo}; color: ${f}; }
.oc-sdk-search-clear:hover { background: ${I}; color: ${N}; }

.oc-sdk-trigger { border-radius: ${ht}; background: var(--oc-sdk-raised-bg); color: ${Z}; ${Rt} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${I}, ${I}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${B}, ${B}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${f}; }
.oc-sdk-trigger-chevron { color: ${f}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${Z}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${ve}; background-clip: padding-box; color: ${Z}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${I}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${Tt}; color: ${St}; }
.oc-sdk-option-check { color: ${N}; }
.oc-sdk-option[data-destructive="true"] { color: ${Ot}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${O(S("status-error","red"),10)}; }
.oc-sdk-option-hint { color: ${f}; }
.oc-sdk-popup-empty { color: ${f}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${V}; border-radius: 4px; color: ${N}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${O(N,60,V)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${V}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${G}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${P}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(16px); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${Ro} }
.oc-sdk-check-desc { color: ${f}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${O(N,4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${f}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${N}; }
.oc-sdk-tab[aria-selected="true"] { color: ${St}; background: ${Tt}; border-color: ${V}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${Z}; background: var(--oc-sdk-raised-bg); ${Rt} }
.oc-sdk-tab-count { color: ${f}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${O(N,6)}; color: ${f}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${O("var(--oc-sdk-tone)",15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${I}; }
.oc-sdk-row[aria-selected="true"] { background: ${Tt}; color: ${St}; }
.oc-sdk-row-lead { font-family: ${At}; color: ${f}; }
.oc-sdk-row-sub { color: ${f}; }
.oc-sdk-row-meta { color: ${f}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${f}; }

.oc-sdk-empty-body { color: ${f}; }

.oc-sdk-spinner { color: ${f}; }
.oc-sdk-spinner-ring { border-color: ${V}; border-top-color: ${P}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${O("var(--oc-sdk-tone)",10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${f}; }

.oc-sdk-separator { color: ${f}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${O(V,40)}; }

.oc-sdk-progress-label { color: ${f}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${O(N,6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${P}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${S("status-success","currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${S("success-text","inherit")}; }

.oc-sdk-text a { color: ${ft}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${O(V,60)}; }
`,g=`
${Ve}
${Bo}
${go}`;var ko=_t(),Io=document.querySelector("#root");if(!Io)throw Error("Missing #root");var gt=document.createElement("div");gt.style.cssText="display:flex;align-items:center;height:100%;padding:0 12px;box-sizing:border-box;";var de=document.createElement("span");de.style.cssText="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px/1.4 var(--oc-font);color:var(--oc-muted);";de.textContent="Cloak Browser";gt.append(de);Io.append(gt);var Jo=async()=>{try{let e=await ko.serviceRequest({method:"GET",path:"/state"}),r=JSON.parse(e.body);if(typeof r.title==="string")de.textContent=r.title}catch{de.textContent="Cloak Browser: the service is not running"}};ko.onReady((e)=>{Et(e,document.documentElement),Jo()});})();
