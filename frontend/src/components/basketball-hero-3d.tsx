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
    let ball: import("three").Group | null = null;
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
        const { GLTFLoader } = await import(
          "three/examples/jsm/loaders/GLTFLoader.js"
        );
        const { toCreasedNormals } = await import(
          "three/examples/jsm/utils/BufferGeometryUtils.js"
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

        const { scene: model } = await new GLTFLoader().loadAsync(
          "/models/basketball.glb",
        );
        if (disposed) return;

        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2.45 / maxDimension;
        model.scale.setScalar(scale);
        model.position.set(
          -center.x * scale,
          -center.y * scale,
          -center.z * scale,
        );

        const bumpCanvas = document.createElement("canvas");
        bumpCanvas.width = 256;
        bumpCanvas.height = 256;
        const bumpContext = bumpCanvas.getContext("2d");
        if (bumpContext) {
          bumpContext.fillStyle = "#727272";
          bumpContext.fillRect(0, 0, 256, 256);
          let seed = 28411;
          const random = () => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
          };
          for (let index = 0; index < 11500; index += 1) {
            const x = random() * 256;
            const y = random() * 256;
            const radius = 0.24 + random() * 0.62;
            const shade = 130 + Math.round(random() * 85);
            bumpContext.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
            bumpContext.beginPath();
            bumpContext.arc(x, y, radius, 0, Math.PI * 2);
            bumpContext.fill();
          }
        }
        const leatherBump = new THREE.CanvasTexture(bumpCanvas);
        leatherBump.wrapS = THREE.RepeatWrapping;
        leatherBump.wrapT = THREE.RepeatWrapping;
        leatherBump.repeat.set(2.6, 2.6);
        leatherBump.anisotropy = Math.min(
          renderer.capabilities.getMaxAnisotropy(),
          4,
        );

        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const originalGeometry = child.geometry;
            child.geometry = toCreasedNormals(
              originalGeometry,
              Math.PI * 0.92,
            );
            originalGeometry.dispose();

            const materials = Array.isArray(child.material)
              ? child.material
              : [child.material];
            materials.forEach((material) => {
              if (!(material instanceof THREE.MeshStandardMaterial)) return;
              material.metalness = 0;
              material.roughness = Math.max(material.roughness, 0.72);
              material.bumpMap = leatherBump;
              material.bumpScale = 0.012;
              if (material.map) {
                material.map.colorSpace = THREE.SRGBColorSpace;
                material.map.anisotropy = Math.min(
                  renderer?.capabilities.getMaxAnisotropy() ?? 1,
                  4,
                );
              }
              material.needsUpdate = true;
            });
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        ball = new THREE.Group();
        ball.add(model);
        ball.position.y = -0.02;
        ball.rotation.set(-0.12, -0.45, 0.08);
        scene.add(ball);

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
            if (ball && !reduceMotion) {
              ball.rotation.y = -0.45 + elapsed * 0.42 + pointerX * 0.28;
              ball.rotation.x = -0.12 + pointerY * 0.16;
              ball.position.y = -0.02 + Math.sin(elapsed * 1.35) * 0.08;
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
          const textures = new Set<import("three").Texture>();
          const materials = new Set<import("three").Material>();
          scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.geometry.dispose();
            const meshMaterials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            meshMaterials.forEach((material) => {
              materials.add(material);
              Object.values(material).forEach((value) => {
                if (value instanceof THREE.Texture) textures.add(value);
              });
            });
          });
          materials.forEach((material) => material.dispose());
          textures.forEach((texture) => texture.dispose());
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
      <a
        className="absolute bottom-4 left-4 text-[9px] font-semibold text-white/35 transition hover:text-white/70"
        href="https://poly.pizza/m/eopD_12UuB8"
        target="_blank"
        rel="noreferrer"
      >
        3D: Poly by Google · CC BY 3.0
      </a>
    </div>
  );
}
