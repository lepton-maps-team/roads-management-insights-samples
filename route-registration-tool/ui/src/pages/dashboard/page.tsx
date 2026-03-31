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
import { clearAllLayers } from "../../utils/clear-all-layers"
import { Typography } from "@mui/material"

export default function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)
  const [disclaimerMessage, setDisclaimerMessage] = useState<string | null>(null)
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
    const storageKey = "route_registration_tool_disclaimer_seen"

    const windowMessage = (window as unknown as Record<string, unknown>)
      .DISCLAIMER_MESSAGE
    const envMessage = import.meta.env.VITE_DISCLAIMER_MESSAGE
    const message = String(windowMessage ?? envMessage ?? "").trim()

    if (!message) return

    setDisclaimerMessage(message)

    try {
      const hasSeen = window.localStorage.getItem(storageKey) === "true"
      if (!hasSeen) setDisclaimerOpen(true)
    } catch {
      // If storage access is blocked, still show the disclaimer once.
      setDisclaimerOpen(true)
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
        />

        {/* Toast notifications */}
        <ToastContainer />
      </Main>
    </PageLayout>
  )
}
