// Each field owns its request, so late results cannot replace another field's
// options. Works with Chinese composition, keyboard navigation and touch.
export function bindKeywordInput(input,{client,category,onSelect}) {
  if(!client)return;
  let timer,controller,sequence=0,composing=false,items=[],selected=-1;
  const output=input.parentElement.querySelector('[data-keyword-options]');
  if(!output)return;
  const close=()=>{output.replaceChildren();output.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');selected=-1;};
  const cancel=()=>{clearTimeout(timer);controller?.abort();sequence++;};
  const choose=index=>{const item=items[index];if(!item)return;cancel();input.value=item.word;onSelect();close();input.focus();};
  const search=()=>{
    cancel();close();if(composing||!input.value.trim())return;
    const version=sequence,query=input.value.trim();
    timer=setTimeout(async()=>{
      controller=new AbortController();
      try {
        const result=await client.search(category(),query,controller.signal);
        if(version!==sequence||!input.isConnected||input.value.trim()!==query)return;
        items=result.terms;output.replaceChildren();
        if(!items.length){const hint=document.createElement('small');hint.textContent='暂无匹配，可直接使用输入的新词。';output.append(hint);}
        for(const [index,item]of items.entries()){
          const option=document.createElement('button');option.type='button';option.id=`${output.id}-${index}`;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.textContent=item.word;
          option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>choose(index));output.append(option);
        }
        output.hidden=false;input.setAttribute('aria-expanded','true');
      }catch(error){if(error.name==='AbortError'||version!==sequence||!input.isConnected)return;output.replaceChildren();const hint=document.createElement('small');hint.textContent='词库暂未连接，可继续手工输入。';output.append(hint);output.hidden=false;}
    },150);
  };
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',output.id);input.setAttribute('aria-expanded','false');input.autocomplete='off';
  input.addEventListener('compositionstart',()=>{composing=true;cancel();close();});
  input.addEventListener('compositionend',()=>{composing=false;onSelect();search();});
  input.addEventListener('input',event=>{if(!event.isComposing&&!composing)search();});
  input.addEventListener('focus',search);
  input.addEventListener('blur',()=>{cancel();close();});
  input.addEventListener('keydown',event=>{
    if(composing||event.isComposing)return;
    if(event.key==='Escape'){cancel();close();return;}
    if(output.hidden||!items.length)return;
    if(event.key==='Enter'&&selected>=0){event.preventDefault();choose(selected);return;}
    if(!['ArrowDown','ArrowUp'].includes(event.key))return;
    event.preventDefault();selected=(selected+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    const options=output.querySelectorAll('[role="option"]');options.forEach((el,index)=>el.setAttribute('aria-selected',String(index===selected)));
    input.setAttribute('aria-activedescendant',options[selected].id);options[selected].scrollIntoView({block:'nearest'});
  });
}
