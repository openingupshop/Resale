"use client";

import { CopyButton } from "@/components/CopyButton";
import { CopyRow, Field } from "@/components/fields";
import {
  descriptionFor,
  fullListingText,
  searchQuery,
  siteFields,
  titleFor,
} from "@/lib/listing-format";
import type { Listing, Platform } from "@/lib/listing-schema";
import { PLATFORM_INFO } from "@/lib/platforms";

export function PlatformPanel({
  listing,
  platform,
  onTitleChange,
  photoCount,
}: {
  listing: Listing;
  platform: Platform;
  onTitleChange: (v: string) => void;
  photoCount: number;
}) {
  const info = PLATFORM_INFO[platform];
  const title = titleFor(listing, platform);
  const description = descriptionFor(listing, platform);
  const titleOver = info.titleMax !== null && title.length > info.titleMax;
  const descOver = info.descriptionMax !== null && description.length > info.descriptionMax;
  const query = searchQuery(listing);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">{info.tips}</p>

      <CopyButton
        text={fullListingText(listing, platform)}
        label={`Copy everything for ${info.shortLabel}`}
        primary
        className="w-full py-3 text-base"
      />

      {info.titleMax !== null && (
        <Field
          label="Title"
          multiline
          value={title}
          onChange={onTitleChange}
          meta={
            <span className={titleOver ? "font-semibold text-danger" : ""}>
              {title.length}/{info.titleMax}
            </span>
          }
        />
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium">
            Description{info.titleMax === null ? " (first line works as the title)" : ""}
          </span>
          {info.descriptionMax !== null && (
            <span className={`text-xs ${descOver ? "font-semibold text-danger" : "text-muted"}`}>
              {description.length}/{info.descriptionMax}
            </span>
          )}
        </div>
        <div className="flex items-start gap-2">
          <pre className="max-h-64 flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-background px-3 py-2.5 font-sans text-sm">
            {description}
          </pre>
          <CopyButton text={description} className="mt-1" />
        </div>
        <p className="mt-1 text-xs text-muted">Edit the shared description and details below.</p>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-surface px-3">
        {siteFields(listing, platform).map((f) => (
          <CopyRow key={f.label} label={f.label} value={f.value} note={f.note} />
        ))}
      </div>

      {photoCount > info.photoMax && (
        <p className="text-xs text-warn-fg">
          {info.shortLabel} takes up to {info.photoMax} photos; you have {photoCount}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <a
          href={info.compsUrl(query)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm font-medium"
        >
          Check {info.compsLabel}
        </a>
        <a
          href={info.sellUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm font-medium"
        >
          Open {info.shortLabel} to list
        </a>
      </div>
      <p className="text-xs text-muted">Fees: {info.fees.summary}.</p>
    </div>
  );
}
