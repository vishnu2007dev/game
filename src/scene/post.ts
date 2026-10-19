import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { Tier } from './quality';

/**
 * Filmic finishing: AgX tone mapping, bloom only on real light sources,
 * fine grain, a lens vignette and a trace of chromatic aberration at the
 * frame edges. Kept subtle so it reads as a camera, not a filter.
 */
export function buildPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, tier: Tier) {
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: tier === 'high' ? 4 : 0,
  });
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({
    intensity: 0.85,
    luminanceThreshold: 0.85,
    luminanceSmoothing: 0.25,
    mipmapBlur: true,
    radius: 0.72,
  });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
  composer.addPass(new EffectPass(camera, bloom, tone));

  const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.62 });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  noise.blendMode.opacity.value = 0.09;
  if (tier === 'high') {
    const ca = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0007, 0.0005),
      radialModulation: true,
      modulationOffset: 0.4,
    });
    composer.addPass(new EffectPass(camera, ca, noise, vignette));
  } else {
    composer.addPass(new EffectPass(camera, noise, vignette));
  }
  return composer;
}
