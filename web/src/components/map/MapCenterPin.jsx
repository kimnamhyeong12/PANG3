import { selectionMarkerUrl } from './markerImages.js';

export default function MapCenterPin() {
  return <img className="map-center-pin" src={selectionMarkerUrl} width="32" height="40" alt="" aria-hidden="true" draggable={false} />;
}
