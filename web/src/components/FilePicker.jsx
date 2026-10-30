import { useId, useState } from 'react';
import AppIcon from './AppIcon.jsx';

export default function FilePicker({ title = '파일 선택', hint, onChange, ...props }) {
  const id = useId();
  const [names, setNames] = useState([]);
  return <div className="file-picker"><input {...props} id={id} type="file" className="file-picker-input" onChange={event => { setNames([...event.target.files].map(file => file.name)); onChange?.(event); }} /><label htmlFor={id} className="file-picker-button"><AppIcon name="folder-outline" /><strong>{title}</strong><span>파일 찾아보기</span></label>{names.length > 0 && <ul className="file-picker-names">{names.map((name, i) => <li key={i}>{name}</li>)}</ul>}{hint && <small>{hint}</small>}</div>;
}
