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

import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import LinkIcon from "@mui/icons-material/Link"
import ShareIcon from "@mui/icons-material/Share"
import {
  Box,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material"
import { useMemo, useState } from "react"

import { useSessionId } from "../../hooks/use-session-id"
import { useLinkSession, useLinkedSessions, useUnlinkSession } from "../../hooks/use-api"
import { buildSessionPath } from "../../utils/session"
import { isValidUuid } from "../../utils/session"
import { toast } from "../../utils/toast"
import Button from "../common/Button"
import Modal from "../common/Modal"

export default function SessionManagerDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const sessionId = useSessionId()
  const [linkInput, setLinkInput] = useState("")
  const { data: linkedSessions = [] } = useLinkedSessions(sessionId)
  const linkSessionMutation = useLinkSession()
  const unlinkSessionMutation = useUnlinkSession()

  const linkedSet = useMemo(() => {
    return new Set(linkedSessions.map((s) => s.toLowerCase()))
  }, [linkedSessions])

  const dashboardLink = useMemo(() => {
    if (!sessionId) return ""
    return `${window.location.origin}${buildSessionPath(sessionId, "/dashboard")}`
  }, [sessionId])

  const linkInputTrimmed = linkInput.trim()

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copied to clipboard", { duration: 1500 })
    } catch {
      toast.error("Failed to copy", { duration: 2500 })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="sm"
      title={
        <Typography
          component="div"
          sx={{
            fontSize: 18,
            fontFamily: '"Google Sans", sans-serif',
            fontWeight: 500,
            color: "#202124",
            lineHeight: "24px",
            letterSpacing: "0",
          }}
        >
          Share session
        </Typography>
      }
      contentSx={{
        // Prevent the dialog actions from being clipped on shorter viewports.
        // Allow the content area to scroll if needed.
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflowY: "auto",
        paddingTop: "12px",
        paddingBottom: "12px",
      }}
      actionsSx={{ paddingTop: "8px", paddingBottom: "16px" }}
      actions={
        <div className="flex gap-2">
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <Stack spacing={2.25} sx={{ minHeight: 0, flex: 1 }}>
        <Typography
          variant="body1"
          sx={{
            lineHeight: 1.55,
            color: "text.primary",
            letterSpacing: "0.1px",
          }}
        >
          Share this workspace with a link, or link another session to view its projects here.
        </Typography>

        <Stack spacing={1}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              color: "text.primary",
              letterSpacing: "0.15px",
              fontSize: 13,
            }}
          >
            Your session
          </Typography>

          <Stack spacing={1}>
            <TextField
              label="Session ID"
              value={sessionId ?? ""}
              placeholder="No active session"
              fullWidth
              size="small"
              InputProps={{
                readOnly: true,
                sx: {
                  fontSize: 13,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                },
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy session ID" arrow>
                      <span>
                        <IconButton
                          size="small"
                          disabled={!sessionId}
                          aria-label="Copy session ID"
                          onClick={() => {
                            if (!sessionId) return
                            void copyToClipboard(sessionId)
                          }}
                          sx={{
                            borderRadius: 2,
                            color: "text.secondary",
                            "&:hover": { backgroundColor: "action.hover" },
                          }}
                        >
                          <ContentCopyIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
              sx={{
                "& .MuiInputLabel-root": { fontSize: 12 },
              }}
            />

            <TextField
              label="Dashboard link"
              value={dashboardLink}
              placeholder="No active session"
              fullWidth
              size="small"
              InputProps={{
                readOnly: true,
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkIcon fontSize="small" style={{ opacity: 0.7 }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy dashboard link" arrow>
                      <span>
                        <IconButton
                          size="small"
                          disabled={!dashboardLink}
                          aria-label="Copy dashboard link"
                          onClick={() => {
                            if (!dashboardLink) return
                            void copyToClipboard(dashboardLink)
                          }}
                          sx={{
                            borderRadius: 2,
                            color: "text.secondary",
                            "&:hover": { backgroundColor: "action.hover" },
                          }}
                        >
                          <ShareIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
              sx={{
                "& .MuiInputLabel-root": { fontSize: 12 },
                "& .MuiInputBase-input": {
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
              }}
            />
          </Stack>
        </Stack>

        <Box>
          <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={2}>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                color: "text.primary",
                letterSpacing: "0.15px",
                fontSize: 13,
              }}
            >
              Link another session
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {linkedSessions.length} linked
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.75, lineHeight: 1.55 }}>
            Paste a session ID. The other person needs to open their session link at least once.
          </Typography>

          <Stack direction="row" spacing={1.5} sx={{ mt: 2 }} alignItems="flex-start">
            <TextField
              value={linkInput}
              onChange={(e) => {
                setLinkInput(e.target.value)
              }}
              fullWidth
              size="small"
              placeholder="3f2504e0-4f89-11d3-9a0c-0305e82c3301"
              label="Session ID"
              inputProps={{
                "aria-label": "Session ID to link",
                spellCheck: false,
              }}
              InputProps={{
                sx: {
                  fontSize: 13,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                },
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkIcon fontSize="small" style={{ opacity: 0.7 }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                "& .MuiInputLabel-root": { fontSize: 12 },
                "& .MuiFormHelperText-root": { fontSize: 11, marginTop: "4px" },
              }}
            />

            <Button
              variant="contained"
              disabled={!sessionId || !linkInputTrimmed || linkSessionMutation.isPending}
              sx={{ minWidth: 120, height: 40, whiteSpace: "nowrap" }}
              onClick={async () => {
                const other = linkInputTrimmed
                if (!isValidUuid(other)) {
                  const msg = "Please enter a valid session ID (UUID)."
                  toast.error(msg)
                  return
                }
                if (sessionId && other.toLowerCase() === sessionId.toLowerCase()) {
                  const msg = "You can’t link a session to itself."
                  toast.error(msg)
                  return
                }
                if (linkedSet.has(other.toLowerCase())) {
                  const msg = "That session is already linked."
                  toast.info(msg, { duration: 2500 })
                  return
                }

                try {
                  await linkSessionMutation.mutateAsync(other)
                  toast.success("Session linked", { duration: 2000 })
                  setLinkInput("")
                } catch (e) {
                  let msg = e instanceof Error ? e.message : "Failed to link session"
                  if (msg === "Session not found.") {
                    msg =
                      "Session not found. Ask the other person to open their session link first."
                  } else if (msg === "Session already linked.") {
                    msg = "That session is already linked."
                  }
                  toast.error(msg)
                }
              }}
            >
              Link session
            </Button>
          </Stack>
        </Box>

        {linkedSessions.length > 0 && (
          <Box sx={{ minHeight: 0 }}>
            <Divider />
            <Stack
              direction="row"
              alignItems="baseline"
              justifyContent="space-between"
              spacing={2}
              sx={{ mt: 2 }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  color: "text.primary",
                  letterSpacing: "0.15px",
                  fontSize: 13,
                }}
              >
                Linked sessions
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {linkedSessions.length} total
              </Typography>
            </Stack>

            <Box
              className="pretty-scrollbar"
              sx={{
                mt: 1,
                maxHeight: 220,
                overflow: "auto",
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                backgroundColor: "background.paper",
              }}
            >
              <List disablePadding>
                {linkedSessions.map((sid, idx) => (
                  <Box key={sid}>
                    <ListItemButton
                      disableRipple
                      sx={{
                        px: 1.25,
                        py: 0.9,
                        alignItems: "center",
                        "&:hover": { backgroundColor: "action.hover" },
                      }}
                    >
                      <ListItemText
                        primary={
                          <Typography
                            variant="body2"
                            sx={{
                              color: "text.primary",
                              fontSize: 13,
                              fontFamily:
                                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                              lineHeight: 1.45,
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {sid}
                          </Typography>
                        }
                        sx={{ m: 0, pr: 1.5 }}
                      />

                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Tooltip title="Copy" arrow>
                          <IconButton
                            size="small"
                            aria-label="Copy linked session ID"
                            onClick={(e) => {
                              e.stopPropagation()
                              void copyToClipboard(sid)
                            }}
                            sx={{
                              borderRadius: 2,
                              color: "text.secondary",
                              "&:hover": { backgroundColor: "transparent" },
                            }}
                          >
                            <ContentCopyIcon fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove" arrow>
                          <span>
                            <IconButton
                              size="small"
                              disabled={unlinkSessionMutation.isPending}
                              aria-label="Remove linked session"
                              onClick={async (e) => {
                                e.stopPropagation()
                                await unlinkSessionMutation.mutateAsync(sid)
                                toast.success("Session unlinked", { duration: 2000 })
                              }}
                              sx={{
                                borderRadius: 2,
                                color: "text.secondary",
                                "&:hover": { backgroundColor: "transparent" },
                              }}
                            >
                              <DeleteOutlineIcon fontSize="inherit" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </ListItemButton>
                    {idx < linkedSessions.length - 1 && <Divider />}
                  </Box>
                ))}
              </List>
            </Box>
          </Box>
        )}
      </Stack>
    </Modal>
  )
}

