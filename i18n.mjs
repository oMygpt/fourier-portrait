export function chooseLanguage(stored,browser='en'){
  return stored==='zh'||stored==='en'?stored:String(browser).toLowerCase().startsWith('zh')?'zh':'en';
}
export function initialLanguage(){
  let stored;try{stored=localStorage.getItem('fourier-language');}catch{}
  return chooseLanguage(stored,globalThis.navigator?.language);
}
export function translatePage(lang){
  document.documentElement.lang=lang==='zh'?'zh-CN':'en';
  document.title=lang==='zh'?'圆周之间 · 我的傅里叶公式':'Fourier Portrait · My Fourier Formula';
  for(const node of document.querySelectorAll('[data-zh]')){
    if(!node.dataset.en)node.dataset.en=node.innerHTML;
    node.innerHTML=lang==='zh'?node.dataset.zh:node.dataset.en;
  }
  for(const button of document.querySelectorAll('[data-lang]'))button.setAttribute('aria-pressed',String(button.dataset.lang===lang));
}
export function progressDetails(data,lang,elapsed=0){
  const zh=lang==='zh',mb=n=>(n/1e6).toFixed(1);
  const bytes=data.cached?(zh?'模型已缓存 · 无需下载':'Cached model · No download'):data.received!==undefined?`${mb(data.received)}${data.total?' / '+mb(data.total):''} MB`:(zh?'正在本地计算':'Computing on your device');
  const remaining=data.received>0&&data.total>data.received?Math.max(1,Math.ceil(elapsed*(data.total-data.received)/data.received/1000)):null;
  return {bytes,eta:remaining?(zh?`下载约剩 ${remaining} 秒`:`~${remaining}s download left`):(zh?'首次需下载约 55 MB 模型 · 之后会缓存':'First visit downloads ~55 MB of models · cached after')};
}
