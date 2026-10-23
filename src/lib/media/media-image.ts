/** Presentation restriction shared by explicitly image-only media relations. */
import { matchesAccept } from './media-picker';
const RASTER_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
export function isRasterMediaImage(file: string | null): boolean {
	return file !== null && matchesAccept(file, RASTER_IMAGE_MIMES);
}
