import type { VideoProviderAdapter } from '../../types/provider';
import { yenimeProvider } from './yenimeProvider';

let activeProvider: VideoProviderAdapter = yenimeProvider;

export function getVideoProvider(): VideoProviderAdapter {
  return activeProvider;
}

export function setVideoProvider(provider: VideoProviderAdapter): void {
  activeProvider = provider;
}

export { yenimeProvider };
