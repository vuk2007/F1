'use client';

/**
 * Live mode.
 *
 * Renders the same screen as a replay, because that is what it is: the same
 * `SessionDataset`, arriving in instalments from the bridge instead of all at once
 * from OpenF1.
 *
 * The page also loads a bridge recording, which uses the same path with the file
 * standing in for the socket. Both end at `setDataset`, so nothing downstream knows
 * or cares which one it is looking at — but only one of them may own the store at a
 * time, so opening a recording pauses the live connection until "Back to live".
 */
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { SessionView } from '@/app/session/[key]/session-view';
import { LiveStatus } from '@/components/LiveStatus';
import { strings } from '@/lib/i18n/strings';
import { useLiveSource } from '@/lib/live/use-live-source';
import { loadRecordingFile } from '@/lib/replay/recordingSource';
import { useSessionStore } from '@/lib/store/session-store';

export default function LivePage() {
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingNote, setRecordingNote] = useState<string | null>(null);
  const { state, following, jumpToLive } = useLiveSource({ enabled: !recordingActive });

  const openRecording = useCallback((file: File) => {
    setRecordingNote(null);
    // Pause live first, so a bridge that happens to be running cannot overwrite it.
    setRecordingActive(true);
    useSessionStore.getState().beginLoad();

    loadRecordingFile(file)
      .then((result) => {
        setRecordingNote(strings.live.recordingLoaded(result.messages, result.skipped));
        /*
         * A recording is a finished session, so it opens at the start ready to be
         * played — which is what setDataset already does. Nothing to restore here,
         * unlike the live path.
         */
        useSessionStore.getState().setDataset(result.dataset);
      })
      .catch((error: unknown) => {
        setRecordingNote(error instanceof Error ? error.message : strings.live.recordingFailed);
        setRecordingActive(false);
      });
  }, []);

  const backToLive = useCallback(() => {
    setRecordingNote(null);
    setRecordingActive(false);
  }, []);

  const statusBar = (
    <LiveStatus
      state={state}
      following={following}
      onJumpToLive={jumpToLive}
      onOpenRecording={openRecording}
      recordingNote={recordingNote}
      recordingActive={recordingActive}
      onBackToLive={backToLive}
    />
  );

  /*
   * Three waiting states, because they need different actions. No bridge is
   * something to go and fix; a connected bridge with a quiet feed is normal between
   * sessions; a recording being read just needs a moment.
   */
  const [heading, body] = recordingActive
    ? [strings.live.loadingRecordingHeading, strings.live.loadingRecordingBody]
    : state.connected
      ? [strings.live.waitingHeading, strings.live.waitingBody]
      : [strings.live.noBridgeHeading, strings.live.noBridgeBody];

  const waiting = (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-16">
      {statusBar}
      <h1 className="mt-8 text-lg font-semibold">{heading}</h1>
      <p className="text-muted mt-3 text-sm">{body}</p>
      {!recordingActive && state.error !== null && !state.connected && (
        <p className="text-muted mt-3 font-mono text-xs">{state.error}</p>
      )}
      <Link href="/" className="text-accent mt-6 inline-block text-sm hover:underline">
        {strings.load.backToPicker}
      </Link>
    </main>
  );

  return <SessionView mode="live" statusBar={statusBar} waiting={waiting} />;
}
