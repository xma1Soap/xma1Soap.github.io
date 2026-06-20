(function(){
  "use strict";
  var root=document.documentElement;
  var storageKey="xma1soap-theme";
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
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init);
  }else{
    init();
  }
})();
