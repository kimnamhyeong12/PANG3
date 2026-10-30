import { useEffect, useRef } from 'react';

export default function Modal({ title, onClose, children, footer, wide = false }) {
  const backdrop=useRef(null);
  const closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(() => {
    const previous=document.activeElement;
    backdrop.current?.querySelector('button,input,select,textarea,a')?.focus();
    const onKey = (e) => {
      if([...document.querySelectorAll('.modal-backdrop')].at(-1)!==backdrop.current)return;
      if(e.key==='Escape'){e.preventDefault();closeRef.current();}
      if(e.key==='Tab'){
        const controls=[...backdrop.current.querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled&&el.getClientRects().length);
        const first=controls[0],last=controls.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey);previous?.focus(); };
  }, []);

  return (
    <div className="modal-backdrop" ref={backdrop} onMouseDown={onClose}>
      <div className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="icon-button" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
