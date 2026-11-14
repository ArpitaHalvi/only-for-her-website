"use client";

import Link from "next/link";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { motion, useReducedMotion } from "motion/react";
import JewelArt from "./JewelArt";
import { ArrowRight } from "./Icons";

gsap.registerPlugin(useGSAP);

/*
 * Cinematic jewellery reveal.
 *   0.0s  the screen is warm ivory
 *   0.3s  a soft golden light sweeps from left to right            (GSAP)
 *   1.0s  the jewellery fades in and settles with a slight scale   (CSS transitions, class "is-in")
 *   1.9s  the headline appears word by word                        (Motion)
 *   2.8s  the supporting line rises into place                     (Motion)
 *   3.3s  the buttons rise into place                              (Motion)
 *   1.2s+ golden particles drift slowly in the background          (GSAP)
 *   2.4s  the ivory settles to white
 * The jewellery and particles also shift very slightly with the pointer.
 */

const HEADLINE = "Elegance That Tells Your Story.".split(" ");
const T_HEAD = 1.9; // seconds before the first word
const STEP = 0.13; // seconds between words
const T_SUB = T_HEAD + HEADLINE.length * STEP + 0.3;
const EASE = [0.16, 1, 0.3, 1] as const;

// Fixed positions (not random at render time) so the server and browser draw the same particles
const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rnd = seeded(11);
const PARTICLES = Array.from({ length: 30 }, () => ({
  x: +(rnd() * 100).toFixed(2),
  y: +(rnd() * 100).toFixed(2),
  s: +(3 + rnd() * 7).toFixed(1),
  o: +(0.3 + rnd() * 0.5).toFixed(2),
  glow: rnd() > 0.55,
}));

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  useGSAP(
    () => {
      const wrap = root.current;
      if (!wrap) return;
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline();
        tl.fromTo(".hero-sweep", { xPercent: -140, opacity: 0, skewX: -14 }, { xPercent: 270, opacity: 1, skewX: -14, duration: 2.1, ease: "power2.inOut" }, 0.3)
          .to(".hero-sweep", { opacity: 0, duration: 0.6, ease: "power1.in" }, 1.8)
          .add(() => wrap.classList.add("is-in"), 1.0)
          .fromTo(".hero-particles", { opacity: 0 }, { opacity: 1, duration: 2.6, ease: "power1.out" }, 1.2)
          .fromTo(wrap, { backgroundColor: "#fbf3e4" }, { backgroundColor: "#ffffff", duration: 2.2, ease: "power1.inOut" }, 2.4);

        // golden particles drift and twinkle, very slowly
        gsap.utils.toArray<HTMLElement>(".pt").forEach((el, i) => {
          gsap.to(el, {
            x: gsap.utils.random(-34, 34),
            y: gsap.utils.random(-80, -24),
            duration: gsap.utils.random(10, 19),
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            delay: -i * 0.8,
          });
          gsap.to(el, { opacity: gsap.utils.random(0.08, 0.35), duration: gsap.utils.random(3, 6.5), ease: "sine.inOut", yoyo: true, repeat: -1, delay: -i * 0.4 });
        });

        // the ring of text in the seal turns slowly; the pieces bob at different speeds
        gsap.to(".hero-seal-ring", { rotation: 360, duration: 34, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
        gsap.utils.toArray<HTMLElement>(".hero-float-in").forEach((el, i) =>
          gsap.to(el, { y: i % 2 ? -10 : 10, rotation: i % 2 ? 1.5 : -1.5, duration: 3.6 + i * 0.8, ease: "sine.inOut", yoyo: true, repeat: -1 }),
        );

        // very subtle parallax on pointer movement, each layer by its own depth
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
          const layers = gsap.utils.toArray<HTMLElement>("[data-depth]").map((el) => ({
            depth: parseFloat(el.dataset.depth || "0"),
            x: gsap.quickTo(el, "x", { duration: 1.4, ease: "power3" }),
            y: gsap.quickTo(el, "y", { duration: 1.4, ease: "power3" }),
          }));
          const move = (e: MouseEvent) => {
            const nx = e.clientX / window.innerWidth - 0.5;
            const ny = e.clientY / window.innerHeight - 0.5;
            layers.forEach((l) => {
              l.x(nx * l.depth * 26);
              l.y(ny * l.depth * 18);
            });
          };
          wrap.addEventListener("mousemove", move);
          return () => {
            wrap.removeEventListener("mousemove", move);
            wrap.classList.remove("is-in");
          };
        }
        return () => wrap.classList.remove("is-in");
      });

      // Reduced motion: everything is simply there, on white
      mm.add("(prefers-reduced-motion: reduce)", () => {
        wrap.classList.add("is-in");
        wrap.style.backgroundColor = "#ffffff";
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  const rise = (delay: number) => ({
    initial: reduce ? false : { y: 28, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { delay, duration: 1, ease: EASE },
  });

  return (
    <section className="hero-wrap" ref={root} data-hero aria-label="Only For Her">
      <noscript>
        <style>{`.hero-wrap{background:#fff!important}.hero-arch,.hero-float,.hero-seal{opacity:1!important;transform:none!important}.hero-sweep,.hero-particles{display:none}.word,.hero-sub,.hero-cta>*{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <div className="hero-particles" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <i
            key={i}
            className={`pt${p.glow ? " glow" : ""}`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, opacity: p.o }}
          />
        ))}
      </div>
      <div className="hero-sweep" aria-hidden="true" />

      <div className="hero2">
        <div className="hero2-copy">
          <h1 className="hero-h display" aria-label={HEADLINE.join(" ")}>
            {HEADLINE.map((w, i) => (
              <span key={i}>
                <span className="wm" aria-hidden="true">
                  <motion.span
                    className="word"
                    initial={reduce ? false : { y: "112%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    transition={{ delay: T_HEAD + i * STEP, duration: 0.95, ease: EASE }}
                  >
                    {w}
                  </motion.span>
                </span>{" "}
              </span>
            ))}
          </h1>

          <motion.p className="hero-lede hero-sub" {...rise(T_SUB)}>
            Discover timeless jewellery inspired by beauty, tradition and devotion.
          </motion.p>

          <div className="hero-cta">
            <motion.div {...rise(T_SUB + 0.45)}>
              <Link href="/shop" className="btn btn-wine" data-magnetic>
                Shop the collection <ArrowRight />
              </Link>
            </motion.div>
            <motion.div {...rise(T_SUB + 0.6)}>
              <Link href="/collections/divine" className="hero-link">
                Explore the divine collection
              </Link>
            </motion.div>
          </div>
        </div>

        <div className="hero2-stage" aria-hidden="true">
          <div className="par" data-depth="0.4">
            <div className="hero-arch">
              <JewelArt kind="necklace" tone="sand" className="fill" />
            </div>
          </div>

          <div className="par" data-depth="1">
            <div className="hero-float hero-jhumka">
              <div className="hero-float-in">
                <JewelArt kind="earring" tone="wine" className="fill" />
              </div>
            </div>
          </div>
          <div className="par" data-depth="1.6">
            <div className="hero-float hero-medal">
              <div className="hero-float-in">
                <JewelArt kind="ganesha" tone="wine" bare className="fill" />
              </div>
            </div>
          </div>

          <div className="par" data-depth="0.7">
            <div className="hero-seal">
              <svg viewBox="0 0 200 200">
                <defs>
                  <path id="seal-circle" d="M100 100m-78 0a78 78 0 1 1 156 0a78 78 0 1 1-156 0" />
                </defs>
                <g className="hero-seal-ring">
                  <text>
                    <textPath href="#seal-circle" startOffset="0">
                      Divine jewellery · Everyday elegance · Only For Her ·
                    </textPath>
                  </text>
                </g>
                <circle cx="100" cy="100" r="34" className="hero-seal-core" />
                <path
                  d="M100 80c1.6 12 7 17.400 19 19-12 1.600-17.400 7-19 19-1.600-12-7-17.400-19-19 12-1.600 17.400-7 19-19Z"
                  className="hero-seal-star"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
