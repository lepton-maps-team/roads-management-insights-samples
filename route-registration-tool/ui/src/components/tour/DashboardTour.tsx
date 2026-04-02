// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Typography } from "@mui/material"
import { useEffect, useMemo, useState } from "react"

import Button from "../common/Button"
import Modal from "../common/Modal"

type TourStep = {
  id: string
  title: string
  body: string
  selector?: string
}

type HighlightRect = {
  top: number
  left: number
  width: number
  height: number
  radius: number
}

function getHighlightRect(selector?: string): HighlightRect | null {
  if (!selector) return null
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) return null

  try {
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" })
  } catch {
    // ignore
  }

  const r = el.getBoundingClientRect()
  if (!r.width || !r.height) return null

  const style = window.getComputedStyle(el)
  const br = parseFloat(style.borderRadius || "0")
  const pad = 6
  return {
    top: Math.max(0, r.top - pad),
    left: Math.max(0, r.left - pad),
    width: r.width + pad * 2,
    height: r.height + pad * 2,
    radius: Number.isFinite(br) ? Math.max(8, br) : 8,
  }
}

export default function DashboardTour({
  open,
  onClose,
  onStepIdChange,
}: {
  open: boolean
  onClose: () => void
  onStepIdChange?: (stepId: string | null) => void
}) {
  const steps: TourStep[] = useMemo(
    () => [
      {
        id: "session",
        title: "Session sharing",
        body: "This dashboard is a session workspace. Use the Session sharing icon in the top bar to copy your session link or link another session to see each other’s projects.",
        selector: "[data-tour='session-sharing']",
      },
      {
        id: "search",
        title: "Search projects",
        body: "Use search to quickly find a project by name.",
        selector: "[data-tour='project-search']",
      },
      {
        id: "add",
        title: "Create a project",
        body: "Start here to create a new project in this session workspace.",
        selector: "[data-tour='add-project']",
      },
      {
        id: "import",
        title: "Import a project",
        body: "Import a ZIP export to restore a project in this workspace.",
        selector: "[data-tour='import-project']",
      },
      {
        id: "open-project",
        title: "Open a project",
        body: "Click any project card to open its workspace and start working with routes.",
        selector:
          "[data-tour='first-project-card'], [data-tour='first-project-card-skeleton']",
      },
    ],
    [],
  )

  const [idx, setIdx] = useState(0)
  const step = steps[idx] ?? steps[0]
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null)

  useEffect(() => {
    if (!onStepIdChange) return
    if (!open) {
      onStepIdChange(null)
      return
    }
    onStepIdChange(step?.id ?? null)
  }, [open, step?.id, onStepIdChange])

  useEffect(() => {
    if (!open) return
    let raf1 = 0
    let raf2 = 0
    let timeoutId: number | null = null

    const update = () => setHighlightRect(getHighlightRect(step?.selector))

    // Run once immediately, then again after layout/paint settles.
    update()
    raf1 = window.requestAnimationFrame(() => {
      update()
      raf2 = window.requestAnimationFrame(update)
    })
    timeoutId = window.setTimeout(update, 150)

    // Also re-run when DOM changes (e.g. skeletons rendered due to tour step).
    const observer = new MutationObserver(() => update())
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tour", "style", "class"],
    })

    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      if (raf1) window.cancelAnimationFrame(raf1)
      if (raf2) window.cancelAnimationFrame(raf2)
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      observer.disconnect()
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
      setHighlightRect(null)
    }
  }, [open, step?.selector])

  useEffect(() => {
    if (open) return
    queueMicrotask(() => setIdx(0))
  }, [open])

  const isFirst = idx === 0
  const isLast = idx === steps.length - 1

  return (
    <>
      {open && highlightRect && (
        <div
          aria-hidden="true"
          className="rst-tour-pulse"
          style={{
            position: "fixed",
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
            borderRadius: highlightRect.radius,
            outline: "3px solid rgba(25, 118, 210, 0.95)",
            pointerEvents: "none",
            zIndex: 1002,
          }}
        />
      )}
      <Modal
        open={open}
        onClose={onClose}
        maxWidth="sm"
        title="Dashboard tour"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outlined"
              onClick={() => setIdx((v) => Math.max(0, v - 1))}
              disabled={isFirst}
            >
              Back
            </Button>
            <Button variant="outlined" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                if (isLast) onClose()
                else setIdx((v) => Math.min(steps.length - 1, v + 1))
              }}
            >
              {isLast ? "Finish" : "Next"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Typography
            variant="overline"
            className="text-gray-500"
            sx={{ letterSpacing: "0.08em" }}
          >
            Step {idx + 1} of {steps.length}
          </Typography>

          <Typography
            variant="h5"
            className="text-gray-900"
            sx={{ fontWeight: 700, lineHeight: 1.15 }}
          >
            {step.title}
          </Typography>

          <Typography
            variant="body1"
            className="text-gray-700 whitespace-pre-wrap"
            sx={{ lineHeight: 1.65 }}
          >
            {step.body}
          </Typography>
        </div>
      </Modal>
    </>
  )
}

