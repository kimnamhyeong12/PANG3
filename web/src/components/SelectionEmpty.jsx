import AppIcon from './AppIcon.jsx';
export default function SelectionEmpty({ icon = 'folder-outline', children }) {
  return <div className="selection-empty"><AppIcon name={icon} /><strong>{children}</strong></div>;
}
