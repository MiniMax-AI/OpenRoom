/**
 * 3D companion: renders the user's VRM model (e.g. made in VRoid Studio) with
 * three.js + @pixiv/three-vrm. Loaded lazily (its own chunk) only when a model
 * is set. Breathes, sways, blinks, looks at the viewer, shows the expression
 * and moves its mouth while the voice speaks.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { approach, CENTER } from '../../utils/parallax';
import {
  EMOTION_PRESETS,
  createBlinker,
  expressionPose,
  expressionWeights,
  frameCamera,
  gazeOffset,
  idleFrame,
  type EmotionWeights,
} from '../../utils/vrmRig';
import type { ModelRendererProps } from './types';
import styles from './Avatar.module.scss';

const FOV = 26;

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

type Status = 'loading' | 'ready' | 'error';

const VrmAvatar: React.FC<ModelRendererProps> = (props) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const [status, setStatus] = useState<Status>('loading');
  const { modelUrl } = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const fail = (reason: string) => {
      if (disposed) return;
      setStatus('error');
      live.current.onError(reason);
    };
    if (!isWebGLAvailable()) {
      fail('3D graphics (WebGL) are not available in this browser');
      return;
    }

    setStatus('loading');
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.className = styles.vrmCanvas;
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 30);
    const key = new THREE.DirectionalLight(0xffffff, Math.PI * 0.9);
    key.position.set(0.8, 1.6, 2.2);
    const rim = new THREE.DirectionalLight(0xffffff, Math.PI * 0.6);
    rim.position.set(-1.2, 1.4, -1.6);
    const ambient = new THREE.AmbientLight(0xffffff, Math.PI * 0.35);
    scene.add(key, rim, ambient);
    const gazeTarget = new THREE.Object3D();
    scene.add(gazeTarget);

    let vrm: VRM | null = null;
    let headY = 1.4;
    let hipsY = 0.9;
    let frame = { y: 1.2, targetY: 1.2, distance: 2 };
    let rimAccent = '';

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const maxRatio = width < 500 ? 1.5 : 2;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      frame = frameCamera(headY, hipsY, camera.aspect, FOV);
      camera.position.set(0, frame.y, frame.distance);
      camera.lookAt(0, frame.targetY, 0);
      camera.updateProjectionMatrix();
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(host);
    resize();

    const onContextLost = (event: Event) => {
      event.preventDefault();
      fail('the 3D view was stopped by the browser');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader
      .loadAsync(modelUrl)
      .then((gltf) => {
        const loaded = gltf.userData.vrm as VRM | undefined;
        if (disposed) {
          if (loaded) VRMUtils.deepDispose(loaded.scene);
          return;
        }
        if (!loaded) throw new Error('this file is not a VRM model');
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(loaded);
        loaded.scene.traverse((obj) => {
          obj.frustumCulled = false;
        });
        if (loaded.lookAt) loaded.lookAt.target = gazeTarget;
        scene.add(loaded.scene);
        loaded.scene.updateMatrixWorld(true);
        const pos = new THREE.Vector3();
        const head = loaded.humanoid.getNormalizedBoneNode('head');
        const hips = loaded.humanoid.getNormalizedBoneNode('hips');
        if (head) headY = head.getWorldPosition(pos).y;
        if (hips) hipsY = hips.getWorldPosition(pos).y;
        vrm = loaded;
        resize();
        setStatus('ready');
        live.current.onReady();
      })
      .catch((err: unknown) => {
        fail(err instanceof Error ? err.message : String(err));
      });

    // ---------------------------------------------------------------- animation
    const blinker = createBlinker();
    const weights: EmotionWeights = { happy: 0, angry: 0, sad: 0, relaxed: 0, surprised: 0 };
    let mouth = 0;
    let raf = 0;
    let last = 0;
    let elapsed = 0;

    const bone = (name: Parameters<VRM['humanoid']['getNormalizedBoneNode']>[0]) =>
      vrm?.humanoid.getNormalizedBoneNode(name) ?? null;

    const animate = (dt: number) => {
      if (!vrm) return;
      const p = live.current;
      const still = p.reducedMotion;
      if (!still) elapsed += dt;
      const t = elapsed;
      const viewer = p.viewer?.current ?? CENTER;
      const pose = expressionPose(p.expression);
      const idle = idleFrame(t, pose, viewer, still);

      const spine = bone('spine');
      const chest = bone('chest') ?? bone('upperChest');
      const neck = bone('neck');
      const head = bone('head');
      if (spine) spine.rotation.x = idle.spineX;
      if (chest) chest.rotation.x = idle.chestX;
      if (neck) neck.rotation.x = idle.neckX;
      if (head) head.rotation.set(idle.headX, idle.headY, idle.headZ);
      const leftUpper = bone('leftUpperArm');
      const rightUpper = bone('rightUpperArm');
      const leftLower = bone('leftLowerArm');
      const rightLower = bone('rightLowerArm');
      if (leftUpper) leftUpper.rotation.z = -idle.upperArmZ;
      if (rightUpper) rightUpper.rotation.z = idle.upperArmZ;
      if (leftLower) leftLower.rotation.z = -idle.lowerArmZ;
      if (rightLower) rightLower.rotation.z = idle.lowerArmZ;
      vrm.scene.position.y = idle.hipsY;

      // Eyes: a point near the camera, shifted toward where they look
      const gaze = gazeOffset(t, pose, viewer, still);
      gazeTarget.position.set(gaze.x * 0.5, frame.y - gaze.y * 0.4, frame.distance);

      // Expressions ease in/out
      const target = expressionWeights(p.expression);
      const manager = vrm.expressionManager;
      for (const preset of EMOTION_PRESETS) {
        weights[preset] = approach(weights[preset], target[preset], dt, 5);
        manager?.setValue(preset, weights[preset]);
      }
      mouth = approach(mouth, p.getMouthOpen?.() ?? 0, dt, 18);
      manager?.setValue('aa', mouth * 0.8);
      manager?.setValue('oh', mouth * 0.25);
      manager?.setValue('blink', blinker.value(performance.now() / 1000) * (1 - weights.happy));

      if (p.accent !== rimAccent) {
        rimAccent = p.accent;
        rim.color.set(p.accent);
      }
      vrm.update(dt);
    };

    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      animate(dt);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    start();

    return () => {
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
      }
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [modelUrl]);

  return (
    <div
      ref={hostRef}
      className={styles.vrmHost}
      data-testid="dl-vrm"
      data-vrm-state={status}
      aria-hidden="true"
    />
  );
};

export default VrmAvatar;
