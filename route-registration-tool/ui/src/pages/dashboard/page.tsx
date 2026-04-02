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

import { useEffect, useMemo, useState } from "react"

import staticMapImage from "../../assets/images/static_map.png"
import Button from "../../components/common/Button"
import Modal from "../../components/common/Modal"
import ToastContainer from "../../components/common/ToastContainer"
import ProjectGrid from "../../components/dashboard/ProjectGrid"
import Main from "../../components/layout/Main"
import PageLayout from "../../components/layout/PageLayout"
import { useInfiniteProjects } from "../../hooks/use-api"
import SessionManagerDialog from "../../components/session/SessionManagerDialog"
import DashboardTour from "../../components/tour/DashboardTour"
import { clearAllLayers } from "../../utils/clear-all-layers"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import HelpOutlineIcon from "@mui/icons-material/HelpOutline"
import ShareIcon from "@mui/icons-material/Share"
import { Box, IconButton, Tooltip, Typography } from "@mui/material"
import { useSessionId } from "../../hooks/use-session-id"
import { buildSessionPath } from "../../utils/session"

export default function DashboardPage() {
  const sessionId = useSessionId()
  const [searchQuery, setSearchQuery] = useState("")
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)
  const [disclaimerMessage, setDisclaimerMessage] = useState<string | null>(null)
  const [sessionIntroOpen, setSessionIntroOpen] = useState(false)
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [pendingTourAfterIntro, setPendingTourAfterIntro] = useState(false)
  const [tourStepId, setTourStepId] = useState<string | null>(null)
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteProjects(searchQuery, 24)
  const projects = useMemo(
    () => data?.pages.flatMap((p) => p.projects) ?? [],
    [data],
  )
  const totalProjects = data?.pages[0]?.pagination.total ?? 0
  const routeSummaries = useMemo(
    () =>
      (data?.pages ?? []).reduce<
        Record<string, { total: number; deleted: number; added: number }>
      >((acc, page) => {
        Object.assign(acc, page.route_summaries || {})
        return acc
      }, {}),
    [data],
  )

  // Clear all layers when dashboard mounts
  useEffect(() => {
    clearAllLayers()
  }, [])

  useEffect(() => {
    if (!sessionId) return
    const key = `rst_session_intro_seen_${sessionId}`
    try {
      const seen = window.localStorage.getItem(key) === "true"
      if (!seen) queueMicrotask(() => setSessionIntroOpen(true))
    } catch {
      queueMicrotask(() => setSessionIntroOpen(true))
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    const key = `rst_dashboard_tour_seen_${sessionId}`
    try {
      const seen = window.localStorage.getItem(key) === "true"
      if (!seen) {
        // Avoid stacking dialogs on first load by keying off intro "seen" state
        // (not the React state, which may not be set yet due to effect timing).
        const introSeen =
          window.localStorage.getItem(`rst_session_intro_seen_${sessionId}`) ===
          "true"
        if (!introSeen) queueMicrotask(() => setPendingTourAfterIntro(true))
        else queueMicrotask(() => setTourOpen(true))
      }
    } catch {
      queueMicrotask(() => setPendingTourAfterIntro(true))
    }
  }, [sessionId])

  useEffect(() => {
    const storageKey = "route_registration_tool_disclaimer_seen"

    const windowMessage = (window as unknown as Record<string, unknown>)
      .DISCLAIMER_MESSAGE
    const envMessage = import.meta.env.VITE_DISCLAIMER_MESSAGE
    const message = String(windowMessage ?? envMessage ?? "").trim()

    if (!message) return
    queueMicrotask(() => setDisclaimerMessage(message))

    try {
      const hasSeen = window.localStorage.getItem(storageKey) === "true"
      if (!hasSeen) queueMicrotask(() => setDisclaimerOpen(true))
    } catch {
      // If storage access is blocked, still show the disclaimer once.
      queueMicrotask(() => setDisclaimerOpen(true))
    }
  }, [])

  const handleDisclaimerClose = () => {
    try {
      window.localStorage.setItem(
        "route_registration_tool_disclaimer_seen",
        "true",
      )
    } catch {
      // Ignore storage failures; user will see disclaimer again next time.
    }
    setDisclaimerOpen(false)
  }

  const handleSessionIntroClose = () => {
    if (sessionId) {
      try {
        window.localStorage.setItem(`rst_session_intro_seen_${sessionId}`, "true")
      } catch {
        // ignore
      }
    }
    setSessionIntroOpen(false)

    if (pendingTourAfterIntro) {
      setPendingTourAfterIntro(false)
      queueMicrotask(() => setTourOpen(true))
    }
  }

  const handleTourClose = () => {
    if (sessionId) {
      try {
        window.localStorage.setItem(`rst_dashboard_tour_seen_${sessionId}`, "true")
      } catch {
        // ignore
      }
    }
    setTourOpen(false)
  }

  const dashboardLink =
    sessionId && typeof window !== "undefined"
      ? `${window.location.origin}${buildSessionPath(sessionId, "/dashboard")}`
      : ""

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // no-op; toast is handled by existing ToastContainer patterns elsewhere
    }
  }

  if (error) {
    return (
      <PageLayout>
        <Main>
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-red-600 mb-4">Failed to load projects</p>
              <p className="text-gray-600">Please try refreshing the page</p>
            </div>
          </div>
        </Main>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <Main>
        {sessionId && (
          <Modal
            open={sessionIntroOpen}
            onClose={handleSessionIntroClose}
            maxWidth="sm"
            title="Your session workspace"
            actions={
              <div className="flex gap-2">
                <Button
                  variant="outlined"
                  onClick={() => {
                    void copyToClipboard(dashboardLink)
                  }}
                  startIcon={<ContentCopyIcon fontSize="small" />}
                >
                  Copy session link
                </Button>
                <Button onClick={handleSessionIntroClose} variant="contained">
                  Got it
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              <Typography
                variant="body1"
                className="text-gray-800"
                sx={{ lineHeight: 1.6 }}
              >
                This dashboard is tied to a session link. Anyone with the link can
                access it (link-based sharing).
              </Typography>

              <Box
                sx={{
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#f9fafb",
                  borderRadius: 2,
                  padding: 2,
                }}
              >
                <Typography
                  variant="subtitle2"
                  className="text-gray-900 mb-1"
                  sx={{ fontWeight: 600 }}
                >
                  Session dashboard link
                </Typography>
                <Typography
                  variant="body2"
                  className="text-gray-700"
                  sx={{
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    wordBreak: "break-all",
                    lineHeight: 1.55,
                  }}
                >
                  {dashboardLink}
                </Typography>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <Typography variant="caption" className="text-gray-600">
                    Session ID
                  </Typography>
                  <div className="min-w-0 flex items-center gap-2">
                    <Typography
                      variant="caption"
                      className="text-gray-800"
                      sx={{
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        wordBreak: "break-all",
                      }}
                    >
                      {sessionId}
                    </Typography>
                    <Tooltip title="Copy session ID" arrow>
                      <IconButton
                        size="small"
                        aria-label="Copy session ID"
                        onClick={() => {
                          if (!sessionId) return
                          void copyToClipboard(sessionId)
                        }}
                        sx={{
                          border: "1px solid #e5e7eb",
                          backgroundColor: "#ffffff",
                          "&:hover": { backgroundColor: "#ffffff" },
                        }}
                      >
                        <ContentCopyIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
                  </div>
                </div>
              </Box>

              <Box
                sx={{
                  borderLeft: "4px solid rgba(25, 118, 210, 0.7)",
                  backgroundColor: "rgba(25, 118, 210, 0.06)",
                  borderRadius: 2,
                  padding: 2,
                }}
              >
                <Typography variant="body2" className="text-gray-700">
                  Tip: You can link another session to view its projects from this
                  workspace.
                </Typography>
                <div className="mt-2">
                  <Button
                    variant="text"
                    onClick={() => setSessionManagerOpen(true)}
                    startIcon={<ShareIcon fontSize="small" />}
                  >
                    Manage session sharing
                  </Button>
                </div>
              </Box>
            </div>
          </Modal>
        )}

        {sessionId && (
          <SessionManagerDialog
            open={sessionManagerOpen}
            onClose={() => setSessionManagerOpen(false)}
          />
        )}

        <DashboardTour
          open={tourOpen}
          onClose={handleTourClose}
          onStepIdChange={setTourStepId}
        />

        {disclaimerMessage && (
          <Modal
            open={disclaimerOpen}
            onClose={handleDisclaimerClose}
            maxWidth="sm"
            title="Disclaimer"
            actions={
              <Button onClick={handleDisclaimerClose} variant="contained">
                I understand
              </Button>
            }
          >
            <Typography
              variant="body2"
              className="text-gray-700 whitespace-pre-wrap"
            >
              {disclaimerMessage}
            </Typography>
          </Modal>
        )}
        <img
          src={staticMapImage}
          alt="World map background"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
        {/* Splash overlay blur */}
        <div className="absolute inset-0 bg-white/30 backdrop-blur-sm z-0" />

        <ProjectGrid
          projects={projects}
          isLoading={isLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onLoadMore={() => fetchNextPage()}
          hasMore={Boolean(hasNextPage)}
          isLoadingMore={isFetchingNextPage}
          totalProjects={totalProjects}
          routeSummaries={routeSummaries}
          tourStepId={tourOpen ? tourStepId : null}
        />

        {/* Tour launcher */}
        <div className="absolute bottom-6 right-6 z-10">
          <Tooltip title="Take a quick tour" arrow>
            <IconButton
              onClick={() => setTourOpen(true)}
              aria-label="Take a quick tour"
              sx={{
                backgroundColor: "rgba(255, 255, 255, 0.92)",
                border: "1px solid #e5e7eb",
                boxShadow:
                  "0 6px 18px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
                "&:hover": {
                  backgroundColor: "#ffffff",
                  boxShadow:
                    "0 10px 26px rgba(0,0,0,0.14), 0 3px 10px rgba(0,0,0,0.10)",
                },
              }}
            >
              <HelpOutlineIcon />
            </IconButton>
          </Tooltip>
        </div>

        {/* Toast notifications */}
        <ToastContainer />
      </Main>
    </PageLayout>
  )
}
