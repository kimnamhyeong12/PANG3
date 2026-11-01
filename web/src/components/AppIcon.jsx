import glyphs from '../assets/ionicons-glyphs.json';
export default function AppIcon({
  name
}) {
  return <span className="app-icon" aria-hidden="true">{String.fromCodePoint(glyphs[name] ?? glyphs['location-outline'])}</span>;
}
