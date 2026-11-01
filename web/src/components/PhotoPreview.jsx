import { useState } from 'react';
import Modal from './Modal.jsx';
import '../styles/photo-preview.css';

// Same in-page overlay pattern as the compiled report photo viewer.
export default function PhotoPreview({ src, alt, className = '' }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="photo-preview-trigger" aria-label={`${alt} 확대`} onClick={() => setOpen(true)}><img className={className} src={src} alt={alt}/></button>
    {open && <Modal title={alt} className="photo-preview-dialog" onClose={() => setOpen(false)}><img src={src} alt={alt}/></Modal>}
  </>;
}
