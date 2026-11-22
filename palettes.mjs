export const PALETTES=Object.freeze({
  ink:Object.freeze({name:'墨白朱印',background:'#F4EFE6',line:'#242729',text:'#242729',accent:'#A43C32',muted:'#6F716C',shadow:'#24272920',glow:0,guide:'#24272955',strong:'#24272999'}),
  navy:Object.freeze({name:'星图蓝',background:'#0B1B3A',line:'#EEF5FF',text:'#F1F6FF',accent:'#73D4EA',muted:'#91ACCB',shadow:'#9CD9FF55',glow:7,guide:'#91ACCB66',strong:'#EEF5FFAA'}),
  silver:Object.freeze({name:'月光银',background:'#111419',line:'#E6E9EE',text:'#F0F1F3',accent:'#B5BECB',muted:'#8F9AA8',shadow:'#E6E9EE44',glow:4,guide:'#8F9AA866',strong:'#E6E9EEAA'})
});
export const PALETTE_IDS=Object.freeze(['ink','navy','silver']);
export const normalizePalette=value=>typeof value==='string'&&Object.hasOwn(PALETTES,value)?value:'ink';
export const getPalette=value=>PALETTES[normalizePalette(value)];
