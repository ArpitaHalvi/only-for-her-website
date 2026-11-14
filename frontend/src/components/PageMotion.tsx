"use client";

import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/*
 * One motion layer for the whole storefront. Pages opt in with attributes:
 *   data-reveal            rises and fades in once as it enters the screen
 *   data-stagger           its children rise in one after another
 *   data-split             a heading whose lines slide up out of a mask
 *   data-parallax="0.15"   drifts slower / faster than the scroll
 *   data-float             bobs gently (used on drawn jewellery)
 *   data-marquee           its first child scrolls sideways forever (pauses on hover)
 * Content is never hidden without script: every start state is set here.
 * Everything is skipped for visitors who ask for reduced motion.
 */
export default function PageMotion() {
  const path = usePathname();

  useGSAP(
    (_ctx, contextSafe) => {
      const mm = gsap.matchMedia();

      // Start only after React has finished hydrating the page: changing the DOM earlier
      // (GSAP sets inline start states) makes React report a hydration mismatch.
      const start = contextSafe!(() => mm.add("(prefers-reduced-motion: no-preference)", () => {
        const once = (trigger: Element, start = "top 88%") => ({ trigger, start, once: true });

        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
          if (el.closest("[data-hero]")) return; // the hero has its own intro
          gsap.fromTo(el, { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9, ease: "power3.out", scrollTrigger: once(el) });
        });

        gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((el) => {
          const kids = Array.from(el.children);
          if (!kids.length) return;
          gsap.fromTo(kids, { y: 56, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.85, ease: "power3.out", stagger: 0.08, scrollTrigger: once(el, "top 85%") });
        });

        gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
          const speed = parseFloat(el.dataset.parallax || "0.15");
          gsap.fromTo(
            el,
            { y: () => -speed * 120 },
            { y: () => speed * 120, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } },
          );
        });

        gsap.utils.toArray<HTMLElement>("[data-float]").forEach((el, i) => {
          gsap.to(el, { y: i % 2 ? -12 : 12, rotation: i % 2 ? 1.2 : -1.2, duration: 3 + (i % 3) * 0.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
        });

        gsap.utils.toArray<HTMLElement>("[data-marquee]").forEach((el) => {
          const track = el.firstElementChild as HTMLElement | null;
          if (!track) return;
          const tween = gsap.to(track, { xPercent: -50, duration: 38, ease: "none", repeat: -1 });
          el.addEventListener("mouseenter", () => gsap.to(tween, { timeScale: 0.15, duration: 0.5 }));
          el.addEventListener("mouseleave", () => gsap.to(tween, { timeScale: 1, duration: 0.5 }));
        });

        // Headings: lines slide up out of a mask. Waits for the fonts so the lines break where they will stay.
        const split = contextSafe!(() => {
          gsap.utils.toArray<HTMLElement>("[data-split]").forEach((el) => {
            if (el.closest("[data-hero]")) return;
            SplitText.create(el, {
              type: "lines",
              mask: "lines",
              autoSplit: true,
              onSplit: (self) =>
                gsap.fromTo(self.lines, { yPercent: 110 }, { yPercent: 0, duration: 1, ease: "power4.out", stagger: 0.1, scrollTrigger: once(el, "top 90%") }),
            });
          });
        });
        document.fonts.ready.then(split);

        // Buttons lean towards the pointer
        const pulls: (() => void)[] = [];
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
          gsap.utils.toArray<HTMLElement>("[data-magnetic]").forEach((el) => {
            const x = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
            const y = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });
            const move = (e: MouseEvent) => {
              const r = el.getBoundingClientRect();
              x((e.clientX - (r.left + r.width / 2)) * 0.28);
              y((e.clientY - (r.top + r.height / 2)) * 0.4);
            };
            const leave = () => {
              x(0);
              y(0);
            };
            el.addEventListener("mousemove", move);
            el.addEventListener("mouseleave", leave);
            pulls.push(() => {
              el.removeEventListener("mousemove", move);
              el.removeEventListener("mouseleave", leave);
            });
          });
        }

        // Late content (streamed in after the first paint) changes the page height
        const t = window.setTimeout(() => ScrollTrigger.refresh(), 600);
        return () => {
          window.clearTimeout(t);
          pulls.forEach((off) => off());
        };
      }));

      const timer = window.setTimeout(start, 700);
      return () => {
        window.clearTimeout(timer);
        mm.revert();
      };
    },
    { dependencies: [path], revertOnUpdate: true },
  );

  return null;
}
