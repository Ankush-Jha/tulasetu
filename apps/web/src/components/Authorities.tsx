/**
 * The bodies this work sits under, on screen.
 *
 * Two shapes. `AuthorityStrip` is a quiet row of marks for a page foot — it says who the
 * standards and the problem statement belong to and nothing more. `AuthorityBoard` is the
 * full account: each body with what it actually is and why it appears, grouped so a reader can
 * tell a ministry from a standards body.
 *
 * On artwork: a mark renders when a file is present at `public/logos/<file>`, and otherwise the
 * body shows a monogram. That fallback is the normal state, not a placeholder waiting to be
 * fixed — see `content/authorities.ts` on why an entry attributes rather than decorates, and
 * `public/logos/README.md` for which files a team is actually entitled to drop in.
 *
 * The `<img>` carries `onError` because a filename in the manifest is a claim that a file
 * exists, and a broken-image glyph in a row of government names looks like a defect in the
 * application rather than a missing asset.
 */

import { useState } from "react";
import { AUTHORITIES, LEGAL_INSTRUMENTS, type Authority } from "../content/authorities";
import { cn } from "../lib/cn";

const GROUP_LABEL: Record<Authority["group"], string> = {
  government: "Government of India",
  laboratory: "Laboratories and traceability",
  standards: "Standards bodies",
  programme: "Programmes",
};

const GROUP_ORDER: Authority["group"][] = ["government", "laboratory", "standards", "programme"];

/** One mark: the artwork if it is there, the monogram if it is not. */
function Mark({ authority, size = 40 }: { authority: Authority; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = `${import.meta.env.BASE_URL}logos/${authority.file}`;

  if (failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-on-primary-fixed"
      >
        <span className="text-label-sm font-semibold tracking-tight">{authority.initials}</span>
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-xl object-contain"
    />
  );
}

/**
 * A quiet row for a page foot.
 *
 * Names beside marks deliberately. A row of bare emblems is a claim of endorsement; a row of
 * marks with the body named under each is a citation.
 */
export function AuthorityStrip({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-6 gap-y-3", className)}>
      {AUTHORITIES.map((a) => (
        <span key={a.name} className="flex items-center gap-2">
          <Mark authority={a} size={28} />
          <span className="text-label-sm text-on-surface-variant">{a.name}</span>
        </span>
      ))}
    </div>
  );
}

/** The full account, for the briefing. */
export function AuthorityBoard() {
  return (
    <div className="flex flex-col gap-6">
      {GROUP_ORDER.map((group) => {
        const items = AUTHORITIES.filter((a) => a.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group}>
            <h3 className="mb-2.5 text-label-sm uppercase tracking-wider text-on-surface-variant/70">
              {GROUP_LABEL[group]}
            </h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {items.map((a) => {
                const body = (
                  <>
                    <Mark authority={a} />
                    <span className="min-w-0">
                      <span className="block text-label-lg text-on-surface">{a.name}</span>
                      <span className="block text-body-sm text-on-surface-variant">{a.role}</span>
                      <span className="mt-1.5 block text-body-md text-on-surface-variant">
                        {a.relevance}
                      </span>
                    </span>
                  </>
                );
                const shell =
                  "flex items-start gap-3.5 rounded-2xl border border-outline-variant/50 p-3.5";
                return a.href ? (
                  <a
                    key={a.name}
                    href={a.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={cn(
                      shell,
                      "transition-colors hover:bg-surface-container-low",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    )}
                  >
                    {body}
                  </a>
                ) : (
                  <div key={a.name} className={shell}>
                    {body}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/*
        Bodies and instruments are different questions. "Who is behind this" is answered above;
        "what does it actually implement" is answered here, and a provision reference is
        checkable in a way an organisation's name is not.
      */}
      <section>
        <h3 className="mb-2.5 text-label-sm uppercase tracking-wider text-on-surface-variant/70">
          What the software implements
        </h3>
        <div className="flex flex-col gap-2">
          {LEGAL_INSTRUMENTS.map((l) => (
            <div
              key={l.title}
              className="rounded-2xl border border-outline-variant/50 p-3.5"
            >
              <p className="text-label-lg text-on-surface">
                {l.title}{" "}
                <span className="font-mono text-body-sm text-on-surface-variant">{l.provision}</span>
              </p>
              <p className="mt-0.5 text-body-md text-on-surface-variant">{l.usedFor}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="text-body-sm text-on-surface-variant">
        These bodies are named because the software implements their standards or answers their
        problem statement. Naming them is citation, not a claim of endorsement, and no official
        emblem is displayed as though this were a government product — the State Emblem of India
        in particular is restricted by the State Emblem of India (Prohibition of Improper Use)
        Act, 2005.
      </p>
    </div>
  );
}
