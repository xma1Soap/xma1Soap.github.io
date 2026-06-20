(function(){
  "use strict";
  var root=document.documentElement;
  var storageKey="xma1soap-theme";
  var siteOrigin="https://xma1soap.github.io";
  var bgByTheme={light:"bg.png",dark:"night-bg.png"};
  var saved=null;
  try{saved=localStorage.getItem(storageKey)}catch(_){}
  var current=saved==="dark"||saved==="light"?saved:"light";
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
  var reduceMotion=false;
  try{
    reduceMotion=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }catch(_){}
  var transitionActive=false;
  var routeCache={};
  var controlsBound=false;
  var scrollTick=false;
  var revealObserver=null;

  function releaseFirstPaintCover(delay){
    if(!root.hasAttribute("data-first-paint-cover"))return;
    window.setTimeout(function(){
      root.setAttribute("data-first-paint-cover","fade");
      window.setTimeout(function(){
        root.removeAttribute("data-first-paint-cover");
      },280);
    },delay||0);
  }

  function clamp(value,min,max){
    return Math.max(min,Math.min(max,value));
  }

  function getCenter(el){
    var rect=el.getBoundingClientRect();
    return {
      x:rect.left+rect.width/2,
      y:rect.top+rect.height/2,
      width:rect.width,
      height:rect.height
    };
  }

  function isShown(el){
    var rect=el.getBoundingClientRect();
    return rect.width>0&&rect.height>0;
  }

  function getTransitionItems(){
    var selectors=[
      ".nav",
      ".hero",
      ".category-bar",
      ".posts .card",
      ".content-wrapper>.article",
      ".article",
      ".sidebar",
      ".footer",
      ".back-to-top",
      ".theme-toggle"
    ];
    var items=[];
    selectors.forEach(function(selector){
      document.querySelectorAll(selector).forEach(function(el){
        if(el.classList&&el.classList.contains("site-bg"))return;
        if(items.indexOf(el)===-1&&isShown(el))items.push(el);
      });
    });
    return items;
  }

  function ensureBackgroundLayer(){
    var layer=document.querySelector(".site-bg");
    if(!layer){
      layer=document.createElement("div");
      layer.className="site-bg";
      layer.setAttribute("aria-hidden","true");
    }
    if(layer.parentElement!==document.body){
      document.body.insertBefore(layer,document.body.firstChild);
    }else if(document.body.firstChild!==layer){
      document.body.insertBefore(layer,document.body.firstChild);
    }
    return layer;
  }

  function maxDistanceFrom(origin){
    var corners=[
      {x:0,y:0},
      {x:window.innerWidth,y:0},
      {x:0,y:window.innerHeight},
      {x:window.innerWidth,y:window.innerHeight}
    ];
    return corners.reduce(function(max,corner){
      return Math.max(max,Math.hypot(corner.x-origin.x,corner.y-origin.y));
    },1);
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

  function ownRouteEnter(){
    document.body.classList.add("route-enter-owned");
  }

  function afterNextPaint(callback){
    var done=false;
    function run(){
      if(done)return;
      done=true;
      callback();
    }
    requestAnimationFrame(function(){
      requestAnimationFrame(run);
    });
    window.setTimeout(run,80);
  }

  function isLocalHostname(hostname){
    return hostname==="localhost"||hostname==="127.0.0.1"||hostname==="::1";
  }

  function sameSiteUrl(url){
    return url.origin===window.location.origin||url.origin===siteOrigin;
  }

  function isHomePath(pathname){
    return pathname==="/"||pathname.endsWith("/index.html");
  }

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

  function normalizeHomeUrl(url){
    return normalizeRouteUrl(url,false).href;
  }

  function normalizeHistoryUrl(url){
    return normalizeRouteUrl(url,true).href;
  }

  function isCurrentRoute(url){
    var currentUrl=normalizeRouteUrl(new URL(window.location.href),false);
    var targetUrl=normalizeRouteUrl(url,false);
    return currentUrl.href===targetUrl.href;
  }

  function getPageUrl(link){
    try{
      return new URL(link.getAttribute("href"),window.location.href);
    }catch(_){
      return null;
    }
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
    try{
      sessionStorage.setItem(transitionKey,JSON.stringify({
        x:origin.x/window.innerWidth,
        y:origin.y/window.innerHeight,
        at:Date.now()
      }));
    }catch(_){}
  }

  function takeStoredOrigin(){
    var raw=null;
    try{
      raw=sessionStorage.getItem(transitionKey);
      sessionStorage.removeItem(transitionKey);
    }catch(_){}
    if(!raw)return null;
    try{
      var data=JSON.parse(raw);
      if(!data||Date.now()-data.at>8000)return null;
      return {
        x:clamp(data.x,0,1)*window.innerWidth,
        y:clamp(data.y,0,1)*window.innerHeight
      };
    }catch(_){
      return null;
    }
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
      var delay=isOrigin?0:Math.round(120+normalized*220);
      var driftX=isOrigin?0:clamp((center.x-origin.x)*0.055,-42,42);
      var driftY=isOrigin?18:Math.round(22+normalized*34);

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
    var pageStyle=Array.prototype.find.call(doc.querySelectorAll("style"),function(style){
      return style.id!=="theme-boot-css";
    });
    var header=doc.querySelector("header");
    var main=doc.querySelector("main");
    var footer=doc.querySelector("footer");
    var backToTop=doc.querySelector("#backToTop");
    if(!header||!main||!footer||!backToTop)throw new Error("Missing route shell");
    return {
      title:title?title.textContent:document.title,
      pageStyle:pageStyle?pageStyle.textContent:"",
      header:header.innerHTML,
      main:main.innerHTML,
      footer:footer.innerHTML,
      backToTop:backToTop.outerHTML
    };
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
        requestAnimationFrame(function(){
          updateScrollState();
          scrollTick=false;
        });
        scrollTick=true;
      }
    },{passive:true});
    document.addEventListener("keydown",function(event){
      if(event.key==="Escape")closeMobileNav();
    });
    document.addEventListener("click",function(event){
      var navToggle=event.target.closest&&event.target.closest("#navToggle");
      if(navToggle){
        event.preventDefault();
        toggleMobileNav();
        return;
      }

      if(event.target.closest&&event.target.closest("#navOverlay")){
        event.preventDefault();
        closeMobileNav();
        return;
      }

      var backToTop=event.target.closest&&event.target.closest("#backToTop");
      if(backToTop){
        event.preventDefault();
        window.scrollTo({top:0,behavior:"smooth"});
        return;
      }

      var category=event.target.closest&&event.target.closest(".category-btn[data-category]");
      if(category){
        event.preventDefault();
        filterCards(category);
        return;
      }

      var link=event.target.closest&&event.target.closest("a[href]");
      if(link&&document.getElementById("navLinks")&&document.getElementById("navLinks").classList.contains("open")){
        closeMobileNav();
      }
      if(link&&canRouteLink(link,event)){
        routeLink(link,event);
      }
    });
    window.addEventListener("popstate",function(){
      routeTo(new URL(window.location.href),null,false);
    });
  }

  function closeMobileNav(){
    var navLinks=document.getElementById("navLinks");
    var navToggle=document.getElementById("navToggle");
    var navOverlay=document.getElementById("navOverlay");
    if(navLinks)navLinks.classList.remove("open");
    if(navToggle)navToggle.classList.remove("open");
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
    cards.forEach(function(card){
      card.style.display=category==="all"||card.dataset.category===category?"":"none";
    });
  }

  function updateScrollState(){
    var nav=document.getElementById("navbar");
    var back=document.getElementById("backToTop");
    var y=window.scrollY;
    if(nav)nav.classList.toggle("scrolled",y>8);
    if(back)back.classList.toggle("visible",y>500);
  }

  function initCardReveal(){
    var cards=document.querySelectorAll(".card");
    if(revealObserver){
      try{revealObserver.disconnect()}catch(_){}
      revealObserver=null;
    }
    if(!cards.length)return;
    if(document.body.classList.contains("route-enter-owned")){
      cards.forEach(function(card){
        card.style.setProperty("--stagger",0);
        card.classList.add("in-view");
      });
      return;
    }
    cards.forEach(function(card,index){
      card.style.setProperty("--stagger",index%2);
      card.classList.remove("in-view");
    });
    if("IntersectionObserver" in window){
      revealObserver=new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){
            entry.target.classList.add("in-view");
            revealObserver.unobserve(entry.target);
          }
        });
      },{rootMargin:"0px 0px -10% 0px",threshold:0});
      cards.forEach(function(card){revealObserver.observe(card)});
    }else{
      cards.forEach(function(card){card.classList.add("in-view")});
    }
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
      var delay=Math.round(40+normalized*170+Math.min(index,5)*12);
      el.setAttribute("data-page-transition-item","");
      el.style.setProperty("--page-transition-delay",delay+"ms");
      maxDelay=Math.max(maxDelay,delay);
    });
    afterNextPaint(function(){
      document.body.classList.remove("page-pre-enter");
      document.body.classList.add("page-entering");
      releaseFirstPaintCover(40);
      setTimeout(function(){
        clearTransitionItems();
        document.body.classList.remove("page-transitioning","page-entering");
      },maxDelay+720);
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
      }
    }).catch(function(error){
      if(push!==false)window.location.href=routeUrl.href;
      else console.warn(error);
    });
  }

  function routeLink(link,event){
    var url=getPageUrl(link);
    if(!url||!sameSiteUrl(url))return;
    event.preventDefault();
    if(isCurrentRoute(url))return;
    if(transitionActive)return;
    if(reduceMotion){
      routeTo(url,null,true);
      return;
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
      routeTo(url,origin,true).finally(function(){
        transitionActive=false;
      });
    },maxDelay+520);
  }

  function initDynamicPage(){
    ensureBackgroundLayer();
    closeMobileNav();
    bindPageControls();
    initCardReveal();
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
      var delay=Math.round(40+normalized*170+Math.min(index,5)*12);
      el.setAttribute("data-page-transition-item","");
      el.style.setProperty("--page-transition-delay",delay+"ms");
      maxDelay=Math.max(maxDelay,delay);
    });

    document.body.classList.add("page-transitioning","page-pre-enter");
    afterNextPaint(function(){
      document.body.classList.remove("page-pre-enter");
      document.body.classList.add("page-entering");
      releaseFirstPaintCover(40);
      setTimeout(function(){
        clearTransitionItems();
        document.body.classList.remove("page-transitioning","page-entering");
      },maxDelay+720);
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
    button.setAttribute("aria-label",dark?"切换到白天模式":"切换到夜间模式");
    button.setAttribute("title",dark?"切换到白天模式":"切换到夜间模式");
    var icon=button.querySelector(".toggle-icon");
    if(!icon){
      button.textContent="";
      icon=document.createElement("span");
      icon.className="toggle-icon";
      button.appendChild(icon);
    }
    var next=dark?"☀":"☾";
    if(animate&&icon.textContent!==next){
      button.classList.add("toggling");
      setTimeout(function(){
        icon.textContent=next;
        button.classList.remove("toggling");
      },200);
    }else{
      icon.textContent=next;
    }
  }

  var button=null;
  function init(){
    ensureBackgroundLayer();
    button=document.querySelector(".theme-toggle");
    var oldRow=document.querySelector(".hero-title-row");
    if(oldRow){
      var title=oldRow.querySelector("h1");
      if(title)oldRow.parentNode.insertBefore(title,oldRow);
      oldRow.remove();
    }
    if(!button){
      button=document.createElement("button");
      button.type="button";
      button.className="theme-toggle";
      button.addEventListener("click",function(){
        setTheme(current==="dark"?"light":"dark");
      });
    }
    if(button.parentElement!==document.body)document.body.appendChild(button);
    updateButton();
    initDynamicPage();
    if(!runPageEnter())releaseFirstPaintCover(30);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init);
  }else{
    init();
  }
})();
