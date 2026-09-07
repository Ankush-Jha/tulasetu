/**
 * The bodies this work sits under, on screen.
 *
 * Two shapes. `AuthorityStrip` is a quiet row of marks for a page foot — it says who the
 * standards and the problem statement belong to and nothing more. `AuthorityBoard` is the
 * full account: each body with what it actually is and why it appears, grouped so a reader can
 * tell a ministry from a standards body.
 *
 * On artwork: a mark renders from `public/logos/<file>`, and a body with no file falls back to a
 * monogram — which two of them (the Legal Metrology Division, the RRSLs) genuinely need, having
 * no published mark of their own.
 *
 * Marks are sized by **height, with width left to the artwork**. Official logos are lockups, not
 * icons: the Bureau of Indian Standards' is nearly 5:1, the Department of Consumer Affairs' 3.4:1,
 * CSIR–NPL's square. Forcing them all into one square box letterboxes the wide ones into a sliver
 * and is the single thing that most makes a logo strip look homemade.
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

/**
 * One mark: the artwork if it is there, the monogram if it is not.
 *
 * `height` is the only dimension given. Width follows the artwork's own proportions, capped so a
 * very wide lockup cannot push the row around.
 */
function Mark({ authority, height = 34 }: { authority: Authority; height?: number }) {
  const [failed, setFailed] = useState(false);
  const src = `${import.meta.env.BASE_URL}logos/${authority.file}`;

  if (failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: height, height }}
        className="flex shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-on-primary-fixed"
      >
        <span className="text-label-sm font-semibold tracking-tight">{authority.initials}</span>
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      style={{ height, maxWidth: height * 4.5 }}
      className="w-auto shrink-0 object-contain object-left"
    />
  );
}

/**
 * One named body's mark, for placing individually — the issuing department in the header, the
 * programme lockup on the sign-in page. Takes the `initials` from `content/authorities.ts` so a
 * caller names a body rather than a filename, and the manifest stays the single place a mark's
 * artwork or wording is changed.
 */
export function AuthorityMark({
  initials,
  height = 30,
  className,
}: {
  initials: string;
  height?: number;
  className?: string;
}) {
  const authority = AUTHORITIES.find((a) => a.initials === initials);
  if (!authority) return null;
  return (
    <span className={className} title={authority.name}>
      <Mark authority={authority} height={height} />
    </span>
  );
}

/**
 * A quiet row for a page foot.
 *
 * The marks stand alone here, with one line of text above framing the whole row as attribution.
 * That line is doing the work the per-mark captions used to: a row of bare emblems on its own
 * would read as a claim of endorsement, and saying *why* each body is named — this software
 * implements their standards and answers their problem statement — is what makes it a citation
 * instead. The captions themselves became redundant the moment real artwork arrived, because an
 * official lockup already carries the organisation's name inside it.
 */
export function AuthorityStrip({
  className,
  caption = true,
}: {
  className?: string;
  /** Suppress the framing line where the surrounding page already supplies one. */
  caption?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {caption && (
        <p className="text-center text-body-sm text-on-surface-variant">
          Built for problem statement SIH26035, issued by the Department of Consumer Affairs.
          Implements OIML R 76 and the Seventh Schedule to the Legal Metrology (General) Rules,
          2011.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
        {AUTHORITIES.map((a) => (
          <Mark key={a.name} authority={a} height={30} />
        ))}
      </div>
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
