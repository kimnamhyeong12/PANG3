import { useEffect, useRef, useState } from 'react';
import { IconDownload } from './Icons';

export default function ReportDownloadButton({ disabled, downloading, onDownload }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return <div className="report-card-download" ref={root}>
    <button type="button" className="btn-secondary" disabled={disabled} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <IconDownload size={16}/>{downloading ? '다운로드 중…' : '다운로드'}
    </button>
    {open && <div className="report-card-download-menu" aria-label="다운로드 형식">
      {['html', 'hwpx'].map(format => <button key={format} type="button" disabled={disabled} onClick={() => { setOpen(false); onDownload(format); }}>{format.toUpperCase()}</button>)}
    </div>}
  </div>;
}
