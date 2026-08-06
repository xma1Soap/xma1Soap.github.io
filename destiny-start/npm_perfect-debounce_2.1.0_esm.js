/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/perfect-debounce@2.1.0/dist/index.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
const h={trailing:!0};function y(a,i=25,t={}){if(t={...h,...t},!Number.isFinite(i))throw new TypeError("Expected `wait` to be a finite number");let f,n,u=[],r,l;const o=(e,s)=>(r=T(a,e,s),r.finally(()=>{if(r=null,t.trailing&&l&&!n){const m=o(e,l);return l=null,m}}),r),c=function(...e){return t.trailing&&(l=e),r||new Promise(s=>{const m=!n&&t.leading;clearTimeout(n),n=setTimeout(()=>{n=null;const g=t.leading?f:o(this,e);l=null;for(const p of u)p(g);u=[]},i),m?(f=o(this,e),s(f)):u.push(s)})},d=e=>{e&&(clearTimeout(e),n=null)};return c.isPending=()=>!!n,c.cancel=()=>{d(n),u=[],l=null},c.flush=()=>{if(d(n),!l||r)return;const e=l;return l=null,o(this,e)},c}async function T(a,i,t){return await a.apply(i,t)}export{y as debounce};
//# sourceMappingURL=/sm/93d76adb18c2629a64daf775ff65e858a21d2aecabaa61557989db186daba5d7.map