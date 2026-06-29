(function(){
  "use strict";
  var root=document.documentElement;
  var storageKey="xma1soap-theme";
  var siteOrigin="https://xma1soap.github.io";
  var bgByTheme={light:"bg.png",dark:"night-bg.png"};
  var saved=null;
  try{saved=localStorage.getItem(storageKey)}catch(_){}
  var current=saved==="dark"||saved==="light"?saved:(root.getAttribute("data-theme")==="dark"?"dark":"light");
  root.setAttribute("data-theme",current);

  function preloadBackground(theme,priority){
    var href=bgByTheme[theme]||bgByTheme.light;
    if(document.querySelector('link[data-theme-bg="'+theme+'"]'))return;
    var link=document.createElement("link");
    link.rel="preload";
    link.as="image";
    link.href=href;
    link.setAttribute("fetchpriority",priority||"auto");
    link.setAttribute("data-theme-bg",theme);
    document.head.appendChild(link);
    var image=new Image();
    image.decoding="async";
    image.src=href;
  }
  preloadBackground("light","high");
  preloadBackground("dark","high");

  var transitionKey="xma1soap-page-transition";
  var starfieldInitialized=false;
  var reduceMotion=false;
  try{reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(_){}
  var transitionActive=false;
  var routeCache={};
  var controlsBound=false;
  var scrollTick=false;
  var revealObserver=null;
  var articleObserver=null;
  var button=null;

  function releaseFirstPaintCover(delay){
    if(!root.hasAttribute("data-first-paint-cover"))return;
    window.setTimeout(function(){
      root.setAttribute("data-first-paint-cover","fade");
      window.setTimeout(function(){root.removeAttribute("data-first-paint-cover")},300);
    },delay||0);
  }

  function clamp(value,min,max){return Math.max(min,Math.min(max,value))}

  function getCenter(el){
    var rect=el.getBoundingClientRect();
    return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,width:rect.width,height:rect.height};
  }

  function isShown(el){
    var rect=el.getBoundingClientRect();
    return rect.width>0&&rect.height>0;
  }

  function getTransitionItems(){
    var selectors=[".nav",".hero",".category-bar",".posts .card:not([hidden])",".content-wrapper>.article",".article",".sidebar",".footer",".back-to-top",".theme-toggle"];
    var items=[];
    selectors.forEach(function(selector){
      document.querySelectorAll(selector).forEach(function(el){
        if(el.classList&&(el.classList.contains("site-bg")||el.id==="starfield"))return;
        if(items.indexOf(el)===-1&&isShown(el))items.push(el);
      });
    });
    return items;
  }

  function ensureBackgroundLayer(){
    var star=document.getElementById("starfield");
    if(!star){
      star=document.createElement("div");
      star.id="starfield";
      document.body.insertBefore(star,document.body.firstChild);
    }else if(document.body.firstElementChild!==star){
      document.body.insertBefore(star,document.body.firstElementChild);
    }
    var layer=document.querySelector(".site-bg");
    if(!layer){
      layer=document.createElement("div");
      layer.className="site-bg";
      layer.setAttribute("aria-hidden","true");
    }
    if(layer.parentElement!==document.body||layer.previousElementSibling!==star){
      document.body.insertBefore(layer,star.nextSibling);
    }
    return layer;
  }

  function maxDistanceFrom(origin){
    var corners=[{x:0,y:0},{x:window.innerWidth,y:0},{x:0,y:window.innerHeight},{x:window.innerWidth,y:window.innerHeight}];
    return corners.reduce(function(max,corner){return Math.max(max,Math.hypot(corner.x-origin.x,corner.y-origin.y))},1);
  }

  function clearTransitionItems(){
    getTransitionItems().forEach(function(el){
      el.removeAttribute("data-page-transition-item");
      el.removeAttribute("data-page-transition-origin");
      el.style.removeProperty("--page-transition-delay");
      el.style.removeProperty("--page-transition-x");
      el.style.removeProperty("--page-transition-y");
    });
  }

  function ownRouteEnter(){document.body.classList.add("route-enter-owned")}

  function afterNextPaint(callback){
    var done=false;
    function run(){if(done)return;done=true;callback()}
    requestAnimationFrame(function(){requestAnimationFrame(run)});
    window.setTimeout(run,50);
  }

  function isLocalHostname(hostname){return hostname==="localhost"||hostname==="127.0.0.1"||hostname==="::1"}
  function sameSiteUrl(url){return url.origin===window.location.origin||url.origin===siteOrigin}
  function isHomePath(pathname){return pathname==="/"||pathname.endsWith("/index.html")}

  function toRouteUrl(url){
    var routed=new URL(url.href);
    if(routed.origin===siteOrigin&&routed.origin!==window.location.origin&&isLocalHostname(window.location.hostname)){
      routed=new URL(routed.pathname+routed.search+routed.hash,window.location.origin);
    }
    return routed;
  }

  function normalizeRouteUrl(url,includeHash){
    var routed=toRouteUrl(url);
    if(isHomePath(routed.pathname))routed.pathname=routed.pathname.replace(/index\.html$/,"");
    if(!includeHash)routed.hash="";
    return routed;
  }

  function normalizeHomeUrl(url){return normalizeRouteUrl(url,false).href}
  function normalizeHistoryUrl(url){return normalizeRouteUrl(url,true).href}

  function isCurrentRoute(url){
    var currentUrl=normalizeRouteUrl(new URL(window.location.href),false);
    var targetUrl=normalizeRouteUrl(url,false);
    return currentUrl.href===targetUrl.href;
  }

  function getPageUrl(link){
    try{return new URL(link.getAttribute("href"),window.location.href)}catch(_){return null}
  }

  function canRouteLink(link,event){
    if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return false;
    if(link.target&&link.target!=="_self")return false;
    if(link.hasAttribute("download"))return false;
    var href=link.getAttribute("href");
    if(!href||href.charAt(0)==="#"||href.indexOf("mailto:")===0||href.indexOf("tel:")===0)return false;
    var url=getPageUrl(link);
    if(!url||!sameSiteUrl(url))return false;
    return url.pathname.endsWith(".html")||isHomePath(url.pathname);
  }

  function setStoredOrigin(origin){
    try{sessionStorage.setItem(transitionKey,JSON.stringify({x:origin.x/window.innerWidth,y:origin.y/window.innerHeight,at:Date.now()}))}catch(_){}
  }

  function takeStoredOrigin(){
    var raw=null;
    try{raw=sessionStorage.getItem(transitionKey);sessionStorage.removeItem(transitionKey)}catch(_){}
    if(!raw)return null;
    try{
      var data=JSON.parse(raw);
      if(!data||Date.now()-data.at>8000)return null;
      return {x:clamp(data.x,0,1)*window.innerWidth,y:clamp(data.y,0,1)*window.innerHeight};
    }catch(_){return null}
  }

  function prepareExit(origin,clicked){
    var items=getTransitionItems();
    var maxDistance=maxDistanceFrom(origin);
    var maxDelay=0;
    items.forEach(function(el){
      var center=getCenter(el);
      var distance=Math.hypot(center.x-origin.x,center.y-origin.y);
      var normalized=clamp(distance/maxDistance,0,1);
      var isOrigin=el===clicked;
      var delay=isOrigin?0:Math.round(60+normalized*120);
      var driftX=isOrigin?0:clamp((center.x-origin.x)*0.055,-42,42);
      var driftY=isOrigin?18:Math.round(22+normalized*36);
      el.setAttribute("data-page-transition-item","");
      if(isOrigin)el.setAttribute("data-page-transition-origin","");
      el.style.setProperty("--page-transition-delay",delay+"ms");
      el.style.setProperty("--page-transition-x",Math.round(driftX)+"px");
      el.style.setProperty("--page-transition-y",driftY+"px");
      maxDelay=Math.max(maxDelay,delay);
    });
    return maxDelay;
  }

  function parseRouteDocument(text){
    var doc=new DOMParser().parseFromString(text,"text/html");
    var title=doc.querySelector("title");
    var pageStyle=Array.prototype.find.call(doc.querySelectorAll("style"),function(style){return style.id!=="theme-boot-css"});
    var header=doc.querySelector("header");
    var main=doc.querySelector("main");
    var footer=doc.querySelector("footer");
    var backToTop=doc.querySelector("#backToTop");
    if(!header||!main||!footer||!backToTop)throw new Error("Missing route shell");
    return {title:title?title.textContent:document.title,pageStyle:pageStyle?pageStyle.textContent:"",header:header.innerHTML,main:main.innerHTML,footer:footer.innerHTML,backToTop:backToTop.outerHTML};
  }

  function fetchRoute(url){
    var routeUrl=normalizeRouteUrl(url,true);
    var key=normalizeHomeUrl(routeUrl);
    if(routeCache[key])return Promise.resolve(routeCache[key]);
    return fetch(routeUrl.href,{credentials:"same-origin"}).then(function(response){
      if(!response.ok)throw new Error("Route fetch failed");
      return response.text();
    }).then(function(text){
      var route=parseRouteDocument(text);
      routeCache[key]=route;
      return route;
    });
  }

  function updatePageStyle(css){
    var style=document.querySelector("style:not(#theme-boot-css)");
    if(style)style.textContent=css;
  }

  function replaceShell(route,url,push){
    var header=document.querySelector("header");
    var main=document.querySelector("main");
    var footer=document.querySelector("footer");
    var oldButton=document.getElementById("backToTop");
    ownRouteEnter();
    if(header)header.innerHTML=route.header;
    if(main)main.innerHTML=route.main;
    if(footer)footer.innerHTML=route.footer;
    if(oldButton)oldButton.outerHTML=route.backToTop;
    updatePageStyle(route.pageStyle);
    document.title=route.title;
    if(push!==false)history.pushState({xma1soap:true},"",normalizeHistoryUrl(url));
    window.scrollTo({top:0,left:0,behavior:"instant"});
    document.body.classList.remove("page-exiting");
  }

  function bindPageControls(){
    if(controlsBound)return;
    controlsBound=true;
    window.addEventListener("scroll",function(){
      if(!scrollTick){
        requestAnimationFrame(function(){updateScrollState();scrollTick=false});
        scrollTick=true;
      }
    },{passive:true});
    document.addEventListener("keydown",function(event){if(event.key==="Escape")closeMobileNav()});
    document.addEventListener("click",function(event){
      var themeButton=event.target.closest&&event.target.closest(".theme-toggle");
      if(themeButton){event.preventDefault();setTheme(current==="dark"?"light":"dark");return}
      var navToggle=event.target.closest&&event.target.closest("#navToggle");
      if(navToggle){event.preventDefault();toggleMobileNav();return}
      if(event.target.closest&&event.target.closest("#navOverlay")){event.preventDefault();closeMobileNav();return}
      var backToTop=event.target.closest&&event.target.closest("#backToTop");
      if(backToTop){event.preventDefault();window.scrollTo({top:0,behavior:reduceMotion?"auto":"smooth"});return}
      var category=event.target.closest&&event.target.closest(".category-btn[data-category]");
      if(category){event.preventDefault();filterCards(category);return}
      var link=event.target.closest&&event.target.closest("a[href]");
      if(link&&document.getElementById("navLinks")&&document.getElementById("navLinks").classList.contains("open"))closeMobileNav();
      if(link&&canRouteLink(link,event))routeLink(link,event);
    });
    window.addEventListener("popstate",function(){routeTo(new URL(window.location.href),null,false)});
  }

  function closeMobileNav(){
    var navLinks=document.getElementById("navLinks");
    var navToggle=document.getElementById("navToggle");
    var navOverlay=document.getElementById("navOverlay");
    if(navLinks)navLinks.classList.remove("open");
    if(navToggle){navToggle.classList.remove("open");navToggle.setAttribute("aria-expanded","false")}
    if(navOverlay)navOverlay.classList.remove("visible");
    document.body.style.overflow="";
  }

  function toggleMobileNav(){
    var navLinks=document.getElementById("navLinks");
    var navToggle=document.getElementById("navToggle");
    var navOverlay=document.getElementById("navOverlay");
    if(!navLinks||!navToggle||!navOverlay)return;
    if(navLinks.classList.contains("open")){
      closeMobileNav();
    }else{
      navLinks.classList.add("open");
      navToggle.classList.add("open");
      navToggle.setAttribute("aria-expanded","true");
      navOverlay.classList.add("visible");
      document.body.style.overflow="hidden";
    }
  }

  function filterCards(button){
    var buttons=document.querySelectorAll(".category-btn[data-category]");
    var cards=document.querySelectorAll(".card[data-category]");
    buttons.forEach(function(item){item.classList.remove("active")});
    button.classList.add("active");
    var category=button.dataset.category;
    var visibleIndex=0;
    cards.forEach(function(card){
      var show=category==="all"||card.dataset.category===category;
      card.hidden=!show;
      if(show){
        card.style.setProperty("--stagger",visibleIndex%4);
        visibleIndex++;
        if(reduceMotion)card.classList.add("in-view");
      }
    });
    initCardReveal();
  }

  function updateScrollState(){
    var nav=document.getElementById("navbar");
    var back=document.getElementById("backToTop");
    var y=window.scrollY||document.documentElement.scrollTop||0;
    if(nav)nav.classList.toggle("scrolled",y>8);
    if(back)back.classList.toggle("visible",y>500);
  }

  function initCardReveal(){
    var cards=document.querySelectorAll(".card:not([hidden])");
    if(revealObserver){try{revealObserver.disconnect()}catch(_){}revealObserver=null}
    if(!cards.length)return;
    if(reduceMotion||document.body.classList.contains("route-enter-owned")){
      cards.forEach(function(card){card.style.setProperty("--stagger",0);card.classList.add("in-view")});
      return;
    }
    cards.forEach(function(card,index){card.style.setProperty("--stagger",index%4);if(!card.classList.contains("in-view"))card.classList.remove("in-view")});
    if("IntersectionObserver" in window){
      revealObserver=new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){entry.target.classList.add("in-view");revealObserver.unobserve(entry.target)}
        });
      },{rootMargin:"0px 0px -8% 0px",threshold:0});
      cards.forEach(function(card){revealObserver.observe(card)});
    }else{
      cards.forEach(function(card){card.classList.add("in-view")});
    }
  }

  function ensureArticleToc(){
    var article=document.querySelector(".article");
    if(!article)return;
    if(article.querySelector(".toc"))return;
    var headings=Array.prototype.slice.call(article.querySelectorAll("h2[id],h3[id]"));
    if(!headings.length)return;
    var toc=document.createElement("div");
    toc.className="toc toc-generated";
    var title=document.createElement("div");
    title.className="toc-title";
    title.textContent="\u76ee\u5f55";
    var list=document.createElement("ul");
    list.className="toc-list";
    headings.forEach(function(heading){
      var li=document.createElement("li");
      var a=document.createElement("a");
      a.href="#"+heading.id;
      a.textContent=heading.textContent;
      li.appendChild(a);
      list.appendChild(li);
    });
    toc.appendChild(title);
    toc.appendChild(list);
    var intro=article.querySelector(".intro");
    if(intro&&intro.nextSibling)article.insertBefore(toc,intro.nextSibling);else article.insertBefore(toc,article.firstChild);
  }

  function initArticleTocState(){
    if(articleObserver){try{articleObserver.disconnect()}catch(_){}articleObserver=null}
    ensureArticleToc();
    var links=Array.prototype.slice.call(document.querySelectorAll(".toc-list a[href^='#']"));
    if(!links.length)return;
    var map={};
    links.forEach(function(link){var id=decodeURIComponent(link.getAttribute("href").slice(1));if(id)map[id]=link});
    var headings=Object.keys(map).map(function(id){return document.getElementById(id)}).filter(Boolean);
    if(!headings.length)return;
    function setActive(id){links.forEach(function(link){link.classList.toggle("active",link===map[id])})}
    setActive(headings[0].id);
    if("IntersectionObserver" in window){
      articleObserver=new IntersectionObserver(function(entries){
        entries.forEach(function(entry){if(entry.isIntersecting)setActive(entry.target.id)});
      },{rootMargin:"-18% 0px -68% 0px",threshold:0});
      headings.forEach(function(heading){articleObserver.observe(heading)});
    }
  }

  function updateNavActive(){
    var currentUrl=normalizeRouteUrl(new URL(window.location.href),false);
    document.querySelectorAll(".nav-links a[href]").forEach(function(link){
      var url=getPageUrl(link);
      if(!url)return;
      var isActive=false;
      if(isHomePath(normalizeRouteUrl(url,false).pathname)&&isHomePath(currentUrl.pathname))isActive=true;
      link.classList.toggle("active",isActive);
    });
  }

  function applyRouteEnter(origin){
    document.body.classList.add("page-transitioning","page-pre-enter");
    var items=getTransitionItems();
    var maxDistance=maxDistanceFrom(origin);
    var maxDelay=0;
    items.forEach(function(el,index){
      var center=getCenter(el);
      var distance=Math.hypot(center.x-origin.x,center.y-origin.y);
      var normalized=clamp(distance/maxDistance,0,1);
      var delay=Math.round(20+normalized*80+Math.min(index,5)*6);
      el.setAttribute("data-page-transition-item","");
      el.style.setProperty("--page-transition-delay",delay+"ms");
      maxDelay=Math.max(maxDelay,delay);
    });
    afterNextPaint(function(){
      document.body.classList.remove("page-pre-enter");
      document.body.classList.add("page-entering");
      releaseFirstPaintCover(60);
      setTimeout(function(){
        clearTransitionItems();
        document.body.classList.remove("page-transitioning","page-entering");
      },maxDelay+480);
    });
  }

  function routeTo(url,origin,push){
    var routeUrl=normalizeRouteUrl(url,true);
    return fetchRoute(url).then(function(route){
      replaceShell(route,routeUrl,push);
      initDynamicPage();
      if(origin){
        applyRouteEnter(origin);
      }else{
        clearTransitionItems();
        document.body.classList.remove("page-transitioning","page-exiting","page-pre-enter","page-entering");
        releaseFirstPaintCover(20);
      }
    }).catch(function(error){
      if(push!==false)window.location.href=routeUrl.href;else console.warn(error);
    });
  }

  function routeLink(link,event){
    var url=getPageUrl(link);
    if(!url||!sameSiteUrl(url))return;
    event.preventDefault();
    if(isCurrentRoute(url))return;
    if(transitionActive)return;
    if(reduceMotion){routeTo(url,null,true);return}
    var homeTarget=isHomePath(normalizeRouteUrl(url,false).pathname);
    if(link.classList.contains("card")&&!homeTarget){beginCardMorph(link,url);return}
    if(link.classList.contains("sidebar-link")&&!homeTarget){
      var sidebar=document.querySelector(".sidebar");
      if(sidebar&&getComputedStyle(sidebar).display!=="none"&&document.querySelector(".content-wrapper .article")){beginSidebarMorph(link,url);return}
    }
    beginCardTransition(link,url);
  }

  function beginCardTransition(link,url){
    if(transitionActive||reduceMotion)return;
    if(!url||!sameSiteUrl(url))return;
    transitionActive=true;
    var origin=getCenter(link);
    setStoredOrigin(origin);
    var maxDelay=prepareExit(origin,link);
    document.body.classList.add("page-transitioning");
    document.body.offsetHeight;
    document.body.classList.add("page-exiting");
    setTimeout(function(){
      routeTo(url,origin,true).finally(function(){transitionActive=false});
    },maxDelay+280);
  }

  function rectOf(el){var r=el.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}}
  function morphDelay(ms){return new Promise(function(resolve){window.setTimeout(resolve,ms)})}
  function nextPaint(){return new Promise(function(resolve){afterNextPaint(function(){resolve()})})}
  var BAKE_PROPS=["background-color","background-image","border-radius","border-top-width","border-right-width","border-bottom-width","border-left-width","border-top-style","border-right-style","border-bottom-style","border-left-style","border-top-color","border-right-color","border-bottom-color","border-left-color","box-shadow","backdrop-filter","-webkit-backdrop-filter","padding-top","padding-right","padding-bottom","padding-left","color","font-size","font-weight","font-family","letter-spacing","line-height","text-align","box-sizing"];
  function bakeVisual(dst,src){var cs=getComputedStyle(src);for(var i=0;i<BAKE_PROPS.length;i++){var v=cs.getPropertyValue(BAKE_PROPS[i]);if(v)dst.style.setProperty(BAKE_PROPS[i],v)}}
  function placeFixed(el,r){el.style.position="fixed";el.style.left=r.left+"px";el.style.top=r.top+"px";el.style.width=r.width+"px";el.style.height=r.height+"px";el.style.margin="0"}
  function createMorphOverlay(){var ov=document.createElement("div");ov.className="morph-overlay";ov.setAttribute("aria-hidden","true");document.body.appendChild(ov);return ov}
  function fadeOthersForMorph(exclude){getTransitionItems().forEach(function(el){if(el===exclude||(el.classList&&el.classList.contains("nav")))return;el.setAttribute("data-page-transition-item","")})}
  function cleanupMorph(ov,nodes){if(ov&&ov.parentNode)ov.parentNode.removeChild(ov);(nodes||[]).forEach(function(n){if(n)n.style.visibility="";});clearTransitionItems();document.body.classList.remove("morph-active","page-transitioning");transitionActive=false}

  function beginCardMorph(link,url){
    if(transitionActive||reduceMotion||!url||!sameSiteUrl(url))return;
    transitionActive=true;
    var routeUrl=normalizeRouteUrl(url,true);
    var card=link,title=card.querySelector(".card-title");
    var cardRect=rectOf(card),titleRect=title?rectOf(title):null;
    var ov=createMorphOverlay();
    var frame=card.cloneNode(true);
    bakeVisual(frame,card);
    frame.classList.add("morph-clone");
    frame.querySelectorAll(".card-title,.card-date,.card-excerpt,.card-tags,.card-read").forEach(function(s){s.style.transition="opacity .22s ease";s.style.opacity="0"});
    placeFixed(frame,cardRect);
    ov.appendChild(frame);
    card.style.visibility="hidden";
    var titleClone=null;
    if(title){
      titleClone=title.cloneNode(true);
      bakeVisual(titleClone,title);
      titleClone.style.color="var(--text)";
      titleClone.classList.add("morph-clone");
      placeFixed(titleClone,titleRect);
      ov.appendChild(titleClone);
      title.style.visibility="hidden";
    }
    document.body.classList.add("morph-active","page-transitioning");
    fadeOthersForMorph(card);
    Promise.all([fetchRoute(url),morphDelay(220)]).then(function(res){
      replaceShell(res[0],routeUrl,true);
      initDynamicPage();
      var article=document.querySelector(".content-wrapper .article")||document.querySelector(".article");
      var h1=article?article.querySelector(".hero h1"):null;
      var aRect=article?rectOf(article):null;
      var h1Rect=h1?rectOf(h1):null,h1cs=h1?getComputedStyle(h1):null;
      if(article)article.style.visibility="hidden";
      if(h1)h1.style.visibility="hidden";
      return nextPaint().then(function(){
        frame.style.transition="left .48s var(--ease),top .48s var(--ease),width .48s var(--ease),height .48s var(--ease),border-radius .48s var(--ease)";
        if(aRect){frame.style.left=aRect.left+"px";frame.style.top=aRect.top+"px";frame.style.width=aRect.width+"px";frame.style.height=aRect.height+"px";frame.style.borderRadius="30px"}
        if(titleClone&&h1Rect&&h1cs){
          titleClone.style.transition="left .48s var(--ease),top .48s var(--ease),width .48s var(--ease),font-size .48s var(--ease),letter-spacing .48s ease,line-height .48s ease,font-weight .48s ease,color .48s ease";
          titleClone.style.left=h1Rect.left+"px";titleClone.style.top=h1Rect.top+"px";titleClone.style.width=h1Rect.width+"px";
          titleClone.style.textAlign="center";
          titleClone.style.fontSize=h1cs.fontSize;titleClone.style.letterSpacing=h1cs.letterSpacing;titleClone.style.lineHeight=h1cs.lineHeight;titleClone.style.fontWeight=h1cs.fontWeight;titleClone.style.color=h1cs.color;
        }
        return morphDelay(500);
      }).then(function(){
        if(article)article.style.visibility="visible";
        if(h1)h1.style.visibility="visible";
        frame.style.transition="opacity .13s ease";frame.style.opacity="0";
        if(titleClone){titleClone.style.transition="opacity .13s ease";titleClone.style.opacity="0"}
        return morphDelay(150);
      });
    }).then(function(){cleanupMorph(ov,null)}).catch(function(){cleanupMorph(ov,[card,title]);window.location.href=routeUrl.href});
  }

  function beginSidebarMorph(link,url){
    if(transitionActive||reduceMotion||!url||!sameSiteUrl(url))return;
    var oldArticle=document.querySelector(".content-wrapper .article")||document.querySelector(".article");
    var oldActive=document.querySelector(".sidebar-link.active");
    if(!oldArticle||!oldActive){beginCardTransition(link,url);return}
    transitionActive=true;
    var routeUrl=normalizeRouteUrl(url,true);
    var newLink=link,newLinkRect=rectOf(newLink),newLinkCs=getComputedStyle(newLink);
    var artRect=rectOf(oldArticle),oldActiveRect=rectOf(oldActive),oldHref=oldActive.getAttribute("href");
    var ov=createMorphOverlay();
    var cloneA=document.createElement("div");
    cloneA.className="morph-clone";
    cloneA.textContent=newLink.textContent.trim();
    cloneA.style.boxSizing="border-box";
    cloneA.style.display="flex";
    cloneA.style.alignItems="flex-start";
    cloneA.style.justifyContent="center";
    cloneA.style.lineHeight="1.35";
    cloneA.style.whiteSpace="nowrap";
    cloneA.style.background="var(--accent-soft)";
    cloneA.style.color="var(--accent)";
    cloneA.style.fontSize=newLinkCs.fontSize;
    cloneA.style.fontWeight="820";
    cloneA.style.borderRadius="12px";
    cloneA.style.padding="7px 10px";
    placeFixed(cloneA,newLinkRect);
    ov.appendChild(cloneA);
    newLink.style.visibility="hidden";
    var cloneB=oldArticle.cloneNode(true);
    bakeVisual(cloneB,oldArticle);
    cloneB.classList.add("morph-clone");
    cloneB.classList.remove("article");
    placeFixed(cloneB,artRect);
    cloneB.style.opacity="1";
    cloneB.style.overflow="hidden";
    cloneB.style.height=Math.min(artRect.height,Math.round(window.innerHeight*0.62))+"px";
    ov.appendChild(cloneB);
    oldArticle.style.visibility="hidden";
    document.body.classList.add("morph-active","page-transitioning");
    Array.prototype.forEach.call(cloneB.childNodes,function(c){if(c.nodeType===1){c.style.transition="opacity .15s ease";c.style.opacity="0"}});
    Promise.all([fetchRoute(url),morphDelay(170)]).then(function(res){
      replaceShell(res[0],routeUrl,true);
      initDynamicPage();
      var newArticle=document.querySelector(".content-wrapper .article")||document.querySelector(".article");
      if(newArticle)newArticle.style.visibility="hidden";
      return nextPaint().then(function(){
        var h1=newArticle?newArticle.querySelector(".hero h1"):null;
        var newArtRect=newArticle?rectOf(newArticle):artRect;
        var h1Rect=h1?rectOf(h1):null,h1cs=h1?getComputedStyle(h1):null;
        var h1Offset=h1Rect?(h1Rect.top-newArtRect.top):36;
        cloneA.style.transition="left .45s var(--ease),top .45s var(--ease),width .45s var(--ease),height .45s var(--ease),padding .45s ease,border-radius .45s ease,font-size .45s var(--ease),letter-spacing .45s ease,line-height .45s ease,font-weight .45s ease,color .45s ease,background .45s ease";
        cloneA.style.left=newArtRect.left+"px";cloneA.style.top=newArtRect.top+"px";
        cloneA.style.width=newArtRect.width+"px";cloneA.style.height=newArtRect.height+"px";
        cloneA.style.borderRadius="30px";
        cloneA.style.paddingTop=h1Offset+"px";
        cloneA.style.paddingLeft="0";cloneA.style.paddingRight="0";
        cloneA.style.background="linear-gradient(145deg,var(--surface-strong),var(--surface-muted))";
        cloneA.style.textAlign="center";
        if(h1cs){cloneA.style.fontSize=h1cs.fontSize;cloneA.style.letterSpacing=h1cs.letterSpacing;cloneA.style.lineHeight=h1cs.lineHeight;cloneA.style.fontWeight=h1cs.fontWeight;cloneA.style.color=h1cs.color}
        var targetLink=document.querySelector('.sidebar-link[href="'+oldHref+'"]');
        var tRect=targetLink?rectOf(targetLink):oldActiveRect;
        cloneB.style.transition="left .42s var(--ease),top .42s var(--ease),width .42s var(--ease),height .42s var(--ease),border-radius .42s ease,opacity .3s ease .12s";
        cloneB.style.left=tRect.left+"px";cloneB.style.top=tRect.top+"px";
        cloneB.style.width=tRect.width+"px";cloneB.style.height=tRect.height+"px";
        cloneB.style.borderRadius="12px";
        cloneB.style.opacity="0";
        return morphDelay(480);
      }).then(function(){
        if(newArticle)newArticle.style.visibility="visible";
        cloneA.style.transition="opacity .13s ease";cloneA.style.opacity="0";
        cloneB.style.transition="opacity .13s ease";cloneB.style.opacity="0";
        return morphDelay(150);
      });
    }).then(function(){cleanupMorph(ov,null)}).catch(function(){cleanupMorph(ov,[newLink,oldArticle]);window.location.href=routeUrl.href});
  }

  function initStarfield(){
    var f=document.getElementById("starfield");
    if(!f||starfieldInitialized||reduceMotion)return;
    starfieldInitialized=true;
    var count=Math.min(260,Math.max(140,Math.round(window.innerWidth/6)));
    var fragment=document.createDocumentFragment();
    for(var i=0;i<count;i++){
      var s=document.createElement("span");
      s.className="star";
      var sz=Math.random()*2.4+.8;
      s.style.left=(Math.random()*100)+"%";
      s.style.top=(Math.random()*100)+"%";
      s.style.width=sz+"px";
      s.style.height=sz+"px";
      s.style.setProperty("--twinkle-duration",(Math.random()*3.8+2.4)+"s");
      s.style.setProperty("--twinkle-delay",(Math.random()*5)+"s");
      s.style.opacity=(Math.random()*.45+.28).toFixed(2);
      fragment.appendChild(s);
    }
    f.appendChild(fragment);
  }

  function initDynamicPage(){
    ensureBackgroundLayer();
    initStarfield();
    closeMobileNav();
    bindPageControls();
    initCardReveal();
    initArticleTocState();
    updateNavActive();
    updateScrollState();
  }

  function runPageEnter(){
    if(reduceMotion)return false;
    var origin=takeStoredOrigin();
    if(!origin)return false;
    ownRouteEnter();
    initCardReveal();
    var items=getTransitionItems();
    var maxDistance=maxDistanceFrom(origin);
    var maxDelay=0;
    items.forEach(function(el,index){
      var center=getCenter(el);
      var distance=Math.hypot(center.x-origin.x,center.y-origin.y);
      var normalized=clamp(distance/maxDistance,0,1);
      var delay=Math.round(20+normalized*80+Math.min(index,5)*6);
      el.setAttribute("data-page-transition-item","");
      el.style.setProperty("--page-transition-delay",delay+"ms");
      maxDelay=Math.max(maxDelay,delay);
    });
    document.body.classList.add("page-transitioning","page-pre-enter");
    afterNextPaint(function(){
      document.body.classList.remove("page-pre-enter");
      document.body.classList.add("page-entering");
      releaseFirstPaintCover(60);
      setTimeout(function(){
        clearTransitionItems();
        document.body.classList.remove("page-transitioning","page-entering");
      },maxDelay+480);
    });
    return true;
  }

  function setTheme(theme){
    current=theme;
    root.setAttribute("data-theme",theme);
    try{localStorage.setItem(storageKey,theme)}catch(_){}
    updateButton(true);
  }

  function updateButton(animate){
    if(!button)return;
    var dark=current==="dark";
    button.setAttribute("aria-label",dark?"\u5207\u6362\u5230\u767d\u5929\u6a21\u5f0f":"\u5207\u6362\u5230\u591c\u95f4\u6a21\u5f0f");
    button.setAttribute("title",dark?"\u5207\u6362\u5230\u767d\u5929\u6a21\u5f0f":"\u5207\u6362\u5230\u591c\u95f4\u6a21\u5f0f");
    button.setAttribute("aria-pressed",dark?"true":"false");
    var icon=button.querySelector(".toggle-icon");
    if(!icon){button.textContent="";icon=document.createElement("span");icon.className="toggle-icon";button.appendChild(icon)}
    var next=dark?"\u2600":"\u263e";
    if(animate&&icon.textContent!==next){
      button.classList.add("toggling");
      setTimeout(function(){icon.textContent=next;button.classList.remove("toggling")},190);
    }else{icon.textContent=next}
  }

  function initThemeButton(){
    button=document.querySelector(".theme-toggle");
    if(!button){
      button=document.createElement("button");
      button.type="button";
      button.className="theme-toggle";
    }
    if(button.parentElement!==document.body)document.body.appendChild(button);
    updateButton(false);
  }

  function init(){
    ensureBackgroundLayer();
    initThemeButton();
    initDynamicPage();
    if(!runPageEnter())releaseFirstPaintCover(30);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
