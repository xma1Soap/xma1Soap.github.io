(function(){
  "use strict";
  var root=document.documentElement;
  var storageKey="xma1soap-theme";
  var saved=null;
  try{saved=localStorage.getItem(storageKey)}catch(_){}
  var current=saved==="dark"||saved==="light"?saved:"light";
  root.setAttribute("data-theme",current);

  function setTheme(theme){
    current=theme;
    root.setAttribute("data-theme",theme);
    try{localStorage.setItem(storageKey,theme)}catch(_){}
    updateButton();
  }

  function updateButton(){
    if(!button)return;
    var dark=current==="dark";
    button.setAttribute("aria-label",dark?"切换到白天模式":"切换到夜间模式");
    button.setAttribute("title",dark?"切换到白天模式":"切换到夜间模式");
    button.textContent=dark?"☀":"☾";
  }

  var button=null;
  function init(){
    if(document.querySelector(".theme-toggle"))return;
    button=document.createElement("button");
    button.type="button";
    button.className="theme-toggle";
    button.addEventListener("click",function(){
      setTheme(current==="dark"?"light":"dark");
    });
    document.body.appendChild(button);
    updateButton();
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init);
  }else{
    init();
  }
})();
