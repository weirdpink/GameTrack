import React from "react";
import { Github, Twitter, Mail, Heart, Database, Zap, Shield } from "lucide-react";

export const Footer: React.FC = React.memo(() => {
  const currentYear = new Date().getFullYear();

  const stats = [
    { label: "Games Tracked", value: "∞", icon: Database },
    { label: "Hours Logged", value: "∞", icon: Zap },
    { label: "Data Privacy", value: "100%", icon: Shield },
  ];

  const links = [
    { label: "Source Code", href: "https://github.com", icon: Github },
    { label: "Updates", href: "https://twitter.com", icon: Twitter },
    { label: "Contact", href: "mailto:hello@gametrack.dev", icon: Mail },
  ];

  return (
    <footer
      className="border-t border-brand-border bg-brand-bg/80 backdrop-blur-sm mt-auto"
      role="contentinfo"
    >
      <div className="w-full px-6 md:px-12 py-10 lg:py-14">
        <div className="max-w-7xl mx-auto">
          {/* Top section - Brand and tagline */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 mb-10">
            <div className="flex flex-col items-start lg:items-start">
              <div className="text-2xl lg:text-3xl font-black tracking-tighter leading-none text-brand-accent select-none">
                GAME<span className="text-white">TRACK</span>_
              </div>
              <p className="text-brand-muted text-sm font-medium mt-2 tracking-wide uppercase font-mono">
                Gaming Registry
              </p>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap items-center justify-center lg:justify-end gap-6 lg:gap-8">
              {stats.map((stat, idx) => (
                <div
                  key={stat.label}
                  className="flex items-center gap-2.5 group cursor-default"
                >
                  <stat.icon
                    className="w-5 h-5 text-brand-accent group-hover:scale-110 transition-transform"
                    aria-hidden="true"
                  />
                  <div className="text-left hidden sm:block">
                    <p className="text-2xl font-black text-white leading-none tracking-tight">
                      {stat.value}
                    </p>
                    <p className="text-[10px] font-mono text-brand-muted uppercase tracking-wider">
                      {stat.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="relative mb-8">
            <div className="h-px bg-gradient-to-r from-transparent via-brand-border to-transparent" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <Heart className="w-3 h-3 text-brand-accent" aria-hidden="true" />
            </div>
          </div>

          {/* Bottom section - Links and copyright */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <nav className="flex flex-wrap items-center justify-center md:justify-start gap-4 lg:gap-6" aria-label="Footer navigation">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target={link.href.startsWith("http") ? "_blank" : undefined}
                  rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="flex items-center gap-1.5 text-sm font-medium text-brand-muted hover:text-brand-accent transition-colors group"
                >
                  <link.icon className="w-4 h-4 group-hover:scale-110 transition-transform" aria-hidden="true" />
                  <span>{link.label}</span>
                </a>
              ))}
            </nav>

            <div className="flex flex-col items-center md:items-end gap-1.5">
              <p className="text-xs font-mono text-brand-muted tracking-widest uppercase">
                Built with precision for gamers
              </p>
              <p className="text-xs font-mono text-brand-muted tracking-wider">
                © {currentYear} GAME<span className="text-brand-accent">TRACK</span>. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
});

export default Footer;