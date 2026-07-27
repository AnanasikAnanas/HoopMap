"use client";

import { useEffect, useRef, useState } from "react";

export function BasketballHero3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let frame = 0;
    let visible = true;
    let model: import("three").Group | null = null;
    let renderer: import("three").WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let visibilityObserver: IntersectionObserver | null = null;
    let pointerX = 0;
    let pointerY = 0;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const initialize = async () => {
      try {
        const THREE = await import("three");
        const { FBXLoader } = await import(
          "three/examples/jsm/loaders/FBXLoader.js"
        );
        if (disposed || !mountRef.current) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
        camera.position.set(0, 0.25, 5.2);

        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.domElement.className = "h-full w-full";
        renderer.domElement.setAttribute("aria-hidden", "true");
        mountRef.current.append(renderer.domElement);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x25211e, 2.25));
        const keyLight = new THREE.DirectionalLight(0xffd5bd, 4.2);
        keyLight.position.set(3, 5, 4);
        keyLight.castShadow = true;
        scene.add(keyLight);
        const rimLight = new THREE.DirectionalLight(0xff6f32, 2.4);
        rimLight.position.set(-4, 0.5, -2);
        scene.add(rimLight);

        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(1.35, 64),
          new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.24 }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = -1.28;
        shadow.receiveShadow = true;
        scene.add(shadow);

        const orbit = new THREE.Mesh(
          new THREE.TorusGeometry(1.72, 0.012, 12, 128),
          new THREE.MeshBasicMaterial({
            color: 0xf26a2e,
            transparent: true,
            opacity: 0.34,
          }),
        );
        orbit.rotation.x = Math.PI / 2.7;
        orbit.rotation.y = -0.25;
        scene.add(orbit);

        model = await new FBXLoader().loadAsync("/models/basketball.fbx");
        if (disposed) return;

        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2.45 / maxDimension;
        model.scale.setScalar(scale);
        model.position.set(
          -center.x * scale,
          -center.y * scale - 0.02,
          -center.z * scale,
        );
        model.rotation.set(-0.12, -0.45, 0.08);
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(model);

        const resize = () => {
          if (!mountRef.current || !renderer) return;
          const { width, height } = mountRef.current.getBoundingClientRect();
          if (!width || !height) return;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mountRef.current);
        resize();

        const clock = new THREE.Clock();
        const render = () => {
          if (disposed || !renderer) return;
          if (visible) {
            const elapsed = clock.getElapsedTime();
            if (model && !reduceMotion) {
              model.rotation.y = -0.45 + elapsed * 0.42 + pointerX * 0.28;
              model.rotation.x = -0.12 + pointerY * 0.16;
              model.position.y =
                -center.y * scale - 0.02 + Math.sin(elapsed * 1.35) * 0.08;
              orbit.rotation.z = elapsed * 0.12;
            }
            renderer.render(scene, camera);
          }
          if (!reduceMotion) frame = requestAnimationFrame(render);
        };

        visibilityObserver = new IntersectionObserver(
          ([entry]) => {
            visible = entry.isIntersecting;
            if (visible && reduceMotion && renderer) {
              renderer.render(scene, camera);
            }
          },
          { threshold: 0.05 },
        );
        visibilityObserver.observe(mountRef.current);
        render();
        setState("ready");

        const onPointerMove = (event: PointerEvent) => {
          const rect = mountRef.current?.getBoundingClientRect();
          if (!rect) return;
          pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
          pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        };
        const onPointerLeave = () => {
          pointerX = 0;
          pointerY = 0;
        };
        mountRef.current.addEventListener("pointermove", onPointerMove);
        mountRef.current.addEventListener("pointerleave", onPointerLeave);

        return () => {
          mountRef.current?.removeEventListener("pointermove", onPointerMove);
          mountRef.current?.removeEventListener(
            "pointerleave",
            onPointerLeave,
          );
          scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.geometry.dispose();
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            materials.forEach((material) => material.dispose());
          });
        };
      } catch {
        if (!disposed) setState("fallback");
        return undefined;
      }
    };

    let disposeScene: (() => void) | undefined;
    void initialize().then((cleanup) => {
      if (disposed) cleanup?.();
      else disposeScene = cleanup;
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      disposeScene?.();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);

  return (
    <div
      className="hero-3d-stage relative"
      role="img"
      aria-label="Интерактивный трёхмерный баскетбольный мяч"
    >
      <div
        ref={mountRef}
        className={`absolute inset-0 transition-opacity duration-500 ${
          state === "ready" ? "opacity-100" : "opacity-0"
        }`}
      />
      {state !== "ready" && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="hero-3d-fallback" aria-hidden="true" />
        </div>
      )}
      <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-dark/75 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white backdrop-blur">
        {state === "loading" ? "Загрузка 3D" : "HOOPMAP · LIVE"}
      </span>
      <span className="absolute bottom-4 right-4 hidden text-[10px] font-bold uppercase tracking-[0.16em] text-white/50 sm:block">
        Наведи, чтобы повернуть
      </span>
    </div>
  );
}
