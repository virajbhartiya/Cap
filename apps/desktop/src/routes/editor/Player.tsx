import { ToggleButton as KToggleButton } from "@kobalte/core/toggle-button";
import { createElementBounds } from "@solid-primitives/bounds";
import { createEventListener } from "@solid-primitives/event-listener";
import { Setter, Show, createEffect, createSignal } from "solid-js";

import { cx } from "cva";
import Tooltip from "~/components/Tooltip";
import { commands } from "~/utils/tauri";
import { FPS, OUTPUT_SIZE, useEditorContext } from "./context";
import { ComingSoonTooltip, EditorButton, Slider } from "./ui";
import { formatTime } from "./utils";
import AspectRatioSelect from "./AspectRatioSelect";

export function Player() {
  const {
    project,
    editorInstance,
    setDialog,
    totalDuration,
    editorState,
    setEditorState,
    zoomOutLimit,
  } = useEditorContext();

  const splitButton = () => (
    <EditorButton<typeof KToggleButton>
      disabled={!window.FLAGS.split}
      pressed={editorState.timeline.interactMode === "split"}
      onChange={(v: boolean) =>
        setEditorState("timeline", "interactMode", v ? "split" : "seek")
      }
      as={KToggleButton}
      variant="danger"
      leftIcon={<IconCapScissors class="text-gray-500" />}
    />
  );

  const isAtEnd = () => {
    const total = totalDuration();
    return total > 0 && total - editorState.playbackTime <= 0.1;
  };

  createEffect(() => {
    if (isAtEnd() && editorState.playing) {
      commands.stopPlayback();
      setEditorState("playing", false);
    }
  });

  const handlePlayPauseClick = async () => {
    try {
      if (isAtEnd()) {
        await commands.stopPlayback();
        setEditorState("playbackTime", 0);
        await commands.seekTo(0);
        await commands.startPlayback(FPS, OUTPUT_SIZE);
        setEditorState("playing", true);
      } else if (editorState.playing) {
        await commands.stopPlayback();
        setEditorState("playing", false);
      } else {
        // Ensure we seek to the current playback time before starting playback
        await commands.seekTo(Math.floor(editorState.playbackTime * FPS));
        await commands.startPlayback(FPS, OUTPUT_SIZE);
        setEditorState("playing", true);
      }
      if (editorState.playing) setEditorState("previewTime", null);
    } catch (error) {
      console.error("Error handling play/pause:", error);
      setEditorState("playing", false);
    }
  };

  createEventListener(document, "keydown", async (e: KeyboardEvent) => {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      const prevTime = editorState.previewTime;

      if (!editorState.playing) {
        if (prevTime !== null) setEditorState("playbackTime", prevTime);

        await commands.seekTo(Math.floor(editorState.playbackTime * FPS));
      }

      await handlePlayPauseClick();
    }
  });

  const currentSegment = () => {
    if (!project.timeline?.segments?.length) return null;

    let currentTime = 0;
    for (const segment of project.timeline.segments) {
      const segmentDuration = (segment.end - segment.start) / segment.timescale;
      if (
        editorState.playbackTime >= currentTime &&
        editorState.playbackTime < currentTime + segmentDuration
      ) {
        return segment;
      }
      currentTime += segmentDuration;
    }

    return null;
  };

  const currentSpeed = () => {
    const segment = currentSegment();
    return segment && segment.timescale !== 1
      ? (1 / segment.timescale).toFixed(2) + "x"
      : null;
  };

  return (
    <div class="flex flex-col flex-1 bg-gray-100 dark:bg-gray-100 rounded-xl shadow-sm">
      <div class="flex gap-3 justify-center p-3">
        <AspectRatioSelect />
        <EditorButton
          onClick={() => {
            const display = editorInstance.recordings.segments[0].display;
            setDialog({
              open: true,
              type: "crop",
              position: {
                ...(project.background.crop?.position ?? { x: 0, y: 0 }),
              },
              size: {
                ...(project.background.crop?.size ?? {
                  x: display.width,
                  y: display.height,
                }),
              },
            });
          }}
          leftIcon={<IconCapCrop class="w-5 text-gray-500" />}
        >
          Crop
        </EditorButton>
        <Show when={currentSpeed()}>
          <div class="flex items-center gap-1 px-3 py-1 bg-blue-500/20 rounded-lg text-gray-600 font-medium">
            <IconLucideClock class="size-4 mr-1" />
            {currentSpeed()}
          </div>
        </Show>
      </div>
      <PreviewCanvas />
      <div class="flex z-10 overflow-hidden flex-row gap-3 justify-between items-center p-5">
        <div class="flex-1">
          <Time
            class="text-gray-500"
            seconds={Math.max(
              editorState.previewTime ?? editorState.playbackTime,
              0
            )}
          />
          <span class="text-gray-400 text-[0.875rem] tabular-nums"> / </span>
          <Time seconds={totalDuration()} />
          <Show when={currentSpeed()}>
            <span class="ml-2 text-xs px-2 py-0.5 bg-blue-500/20 rounded-full text-gray-500">
              {currentSpeed()}
            </span>
          </Show>
        </div>
        <div class="flex flex-row items-center justify-center text-gray-400 gap-8 text-[0.875rem]">
          <button
            type="button"
            class="transition-opacity hover:opacity-70 will-change-[opacity]"
            onClick={async () => {
              await commands.stopPlayback();
              setEditorState("playing", false);
              setEditorState("playbackTime", 0);
            }}
          >
            <IconCapPrev class="text-gray-500 size-3" />
          </button>
          <button
            type="button"
            onClick={handlePlayPauseClick}
            class="flex justify-center items-center bg-gray-200 rounded-full border border-gray-300 transition-colors hover:bg-gray-300 hover:text-black size-9"
          >
            {!editorState.playing || isAtEnd() ? (
              <IconCapPlay class="text-gray-500 size-3" />
            ) : (
              <IconCapPause class="text-gray-500 size-3" />
            )}
          </button>
          <button
            type="button"
            class="transition-opacity hover:opacity-70 will-change-[opacity]"
            onClick={async () => {
              await commands.stopPlayback();
              setEditorState("playing", false);
              setEditorState("playbackTime", totalDuration());
            }}
          >
            <IconCapNext class="text-gray-500 size-3" />
          </button>
        </div>
        <div class="flex flex-row flex-1 gap-4 justify-end items-center">
          <div class="flex-1" />
          {window.FLAGS.split ? (
            splitButton()
          ) : (
            <ComingSoonTooltip>{splitButton()}</ComingSoonTooltip>
          )}
          <div class="w-px h-8 rounded-full bg-gray-200" />
          <Tooltip content="Zoom out">
            <IconCapZoomOut
              onClick={() => {
                editorState.timeline.transform.updateZoom(
                  editorState.timeline.transform.zoom * 1.1,
                  editorState.playbackTime
                );
              }}
              class="text-gray-500 size-5 will-change-[opacity] transition-opacity hover:opacity-70"
            />
          </Tooltip>
          <Tooltip content="Zoom in">
            <IconCapZoomIn
              onClick={() => {
                editorState.timeline.transform.updateZoom(
                  editorState.timeline.transform.zoom / 1.1,
                  editorState.playbackTime
                );
              }}
              class="text-gray-500 size-5 will-change-[opacity] transition-opacity hover:opacity-70"
            />
          </Tooltip>
          <Slider
            class="w-24"
            minValue={0}
            maxValue={1}
            step={0.001}
            value={[
              Math.min(
                Math.max(
                  1 - editorState.timeline.transform.zoom / zoomOutLimit(),
                  0
                ),
                1
              ),
            ]}
            onChange={([v]) => {
              editorState.timeline.transform.updateZoom(
                (1 - v) * zoomOutLimit(),
                editorState.playbackTime
              );
            }}
            formatTooltip={() =>
              `${editorState.timeline.transform.zoom.toFixed(
                0
              )} seconds visible`
            }
          />
        </div>
      </div>
    </div>
  );
}

function PreviewCanvas() {
  const { latestFrame } = useEditorContext();

  let canvasRef: HTMLCanvasElement | undefined;

  const [canvasContainerRef, setCanvasContainerRef] =
    createSignal<HTMLDivElement>();
  const containerBounds = createElementBounds(canvasContainerRef);

  createEffect(() => {
    const frame = latestFrame();
    if (!frame) return;
    if (!canvasRef) return;
    const ctx = canvasRef.getContext("2d");
    ctx?.putImageData(frame.data, 0, 0);
  });

  return (
    <div
      ref={setCanvasContainerRef}
      class="relative flex-1 justify-center items-center"
    >
      <Show when={latestFrame()}>
        {(currentFrame) => {
          const padding = 4;

          const containerAspect = () => {
            if (containerBounds.width && containerBounds.height) {
              return (
                (containerBounds.width - padding * 2) /
                (containerBounds.height - padding * 2)
              );
            }

            return 1;
          };

          const frameAspect = () =>
            currentFrame().width / currentFrame().data.height;

          const size = () => {
            if (frameAspect() < containerAspect()) {
              const height = (containerBounds.height ?? 0) - padding * 1;

              return {
                width: height * frameAspect(),
                height,
              };
            }

            const width = (containerBounds.width ?? 0) - padding * 2;

            return {
              width,
              height: width / frameAspect(),
            };
          };

          return (
            <div class="absolute inset-0 overflow-hidden flex items-center justify-center h-full">
              <canvas
                style={{
                  width: `${size().width - padding * 2}px`,
                  height: `${size().height}px`,
                }}
                class="bg-blue-50 rounded"
                ref={canvasRef}
                id="canvas"
                width={currentFrame().width}
                height={currentFrame().data.height}
              />
            </div>
          );
        }}
      </Show>
    </div>
  );
}

function Time(props: { seconds: number; fps?: number; class?: string }) {
  return (
    <span class={cx("text-gray-400 text-sm tabular-nums", props.class)}>
      {formatTime(props.seconds, props.fps ?? FPS)}
    </span>
  );
}
