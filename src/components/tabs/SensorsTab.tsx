import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/Sparkline";
import { SENSOR_LABELS, SENSOR_UNITS, SensorAlert, SensorKey, SensorState } from "@/hooks/useSensorSimulation";
import { Activity, Camera, DoorOpen, Flame, Loader2, ScanEye, Send, Thermometer, Trash2, Wind, Waves, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { callFn } from "@/lib/api";
import { toast } from "sonner";
import { severityClass } from "@/lib/threat";
import { useSettings } from "@/hooks/useSettings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteRoomSnapshot, loadHouseMemory, recordMotionDemoEvent, saveRoomSnapshot, subscribeGuardianMemory, type MotionDemoEvent, type SavedRoom } from "@/lib/guardianMemory";

const ICONS: Record<SensorKey, LucideIcon> = {
  temperature: Thermometer, smoke: Flame, co: Wind, flood: Waves, motion: Activity, door: DoorOpen,
};

type RoomMemoryResponse = {
  roomMemory?: {
    summary?: string;
    observed_features?: string[];
    entry_points?: string[];
    typical_risks?: string[];
    confidence?: string;
  };
};

type MotionDemoResponse = {
  motionDemo?: {
    room_match?: boolean;
    person_detected?: boolean;
    should_alert?: boolean;
    summary?: string;
    evidence?: string[];
    recommended_action?: string;
    confidence?: string;
  };
};

type ImageAttachment = { dataUrl: string; name: string };

interface Props {
  readings: SensorState;
  alerts: SensorAlert[];
  trigger: {
    motion: () => void; smoke: () => void; co: () => void;
    flood: () => void; door: () => void; tempHigh: () => void;
  };
}

export function SensorsTab({ readings, alerts, trigger }: Props) {
  const settings = useSettings();
  const baselineFileRef = useRef<HTMLInputElement>(null);
  const motionFileRef = useRef<HTMLInputElement>(null);
  const [savedRooms, setSavedRooms] = useState<SavedRoom[]>([]);
  const [motionEvents, setMotionEvents] = useState<MotionDemoEvent[]>([]);
  const [roomName, setRoomName] = useState("");
  const [roomTagsInput, setRoomTagsInput] = useState("");
  const [roomNotes, setRoomNotes] = useState("");
  const [baselineImage, setBaselineImage] = useState<ImageAttachment | null>(null);
  const [motionImage, setMotionImage] = useState<ImageAttachment | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [savingRoom, setSavingRoom] = useState(false);
  const [runningMotionDemo, setRunningMotionDemo] = useState(false);
  const [motionResult, setMotionResult] = useState<MotionDemoResponse["motionDemo"] | null>(null);

  useEffect(() => {
    const sync = () => {
      const memory = loadHouseMemory();
      setSavedRooms(memory.rooms);
      setMotionEvents(memory.motionEvents);
      setSelectedRoomId((current) => current || memory.rooms[0]?.id || "");
    };
    sync();
    return subscribeGuardianMemory(sync);
  }, []);

  const testTelegram = async () => {
    if (!settings.telegramChatId) {
      toast.error("Connect your Telegram in Settings first.");
      return;
    }
    try {
      await callFn("telegram-alert", {
        chatId: settings.telegramChatId,
        message: "Guardian AI test alert. Telegram is connected.",
      });
      toast.success("Telegram test sent!");
    } catch (e) {
      toast.error(`Telegram: ${e instanceof Error ? e.message : "Failed to send test alert"}`);
    }
  };

  const onPickFile = (event: ChangeEvent<HTMLInputElement>, setter: (image: ImageAttachment | null) => void) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Use images under 4MB for the room-memory demo.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setter({ dataUrl: reader.result as string, name: file.name });
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const saveRoom = async () => {
    if (!baselineImage || !roomName.trim()) {
      toast.error("Add a room name and a baseline room image.");
      return;
    }

    setSavingRoom(true);
    try {
      const result = await callFn<RoomMemoryResponse>("guardian-vision", {
        analysisMode: "room_memory",
        imageDataUrl: baselineImage.dataUrl,
        roomName: roomName.trim(),
        roomTags: parseTags(roomTagsInput),
        roomNotes: roomNotes.trim(),
      });

      const summary = result.roomMemory;
      const room = saveRoomSnapshot({
        roomName: roomName.trim(),
        tags: parseTags(roomTagsInput),
        notes: roomNotes.trim(),
        imageDataUrl: baselineImage.dataUrl,
        aiSummary: summary?.summary,
        observedFeatures: summary?.observed_features ?? [],
        entryPoints: summary?.entry_points ?? [],
        typicalRisks: summary?.typical_risks ?? [],
      });

      setSelectedRoomId(room.id);
      setRoomName("");
      setRoomTagsInput("");
      setRoomNotes("");
      setBaselineImage(null);
      toast.success(`Saved ${room.roomName} to house memory.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save room");
    } finally {
      setSavingRoom(false);
    }
  };

  const runMotionDemo = async () => {
    const room = savedRooms.find((item) => item.id === selectedRoomId);
    if (!room || !motionImage) {
      toast.error("Choose a saved room and a current image for the motion demo.");
      return;
    }

    setRunningMotionDemo(true);
    try {
      const result = await callFn<MotionDemoResponse>("guardian-vision", {
        analysisMode: "motion_demo",
        roomName: room.roomName,
        roomTags: room.tags,
        roomNotes: room.notes,
        referenceImageDataUrl: room.imageDataUrl,
        imageDataUrl: motionImage.dataUrl,
      });

      const motion = result.motionDemo ?? null;
      setMotionResult(motion);

      if (motion) {
        recordMotionDemoEvent({
          roomId: room.id,
          roomName: room.roomName,
          personDetected: Boolean(motion.person_detected),
          shouldAlert: Boolean(motion.should_alert),
          roomMatch: Boolean(motion.room_match),
          confidence: motion.confidence || "Medium",
          summary: motion.summary || "Motion demo completed.",
          recommendedAction: motion.recommended_action,
        });
      }

      if (motion?.should_alert) {
        trigger.motion();
        toast.warning(`Motion alert triggered for ${room.roomName}. Set Presence to Away if you want Telegram push for the demo.`);
      } else {
        toast.success("Motion demo completed without triggering an alert.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Motion demo failed");
    } finally {
      setRunningMotionDemo(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-mono tracking-wider text-muted-foreground">LIVE SENSOR FEED AND ROOM MEMORY DEMO</h2>
        <Button variant="outline" size="sm" onClick={testTelegram}>
          <Send className="h-4 w-4 mr-1" /> Test Telegram
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(Object.keys(SENSOR_LABELS) as SensorKey[]).map((k) => {
          const arr = readings[k] ?? [];
          const last = arr[arr.length - 1]?.value ?? 0;
          const Icon = ICONS[k];
          const isBinary = k === "flood" || k === "motion" || k === "door";
          const danger = (k === "smoke" && last >= 50) || (k === "co" && last >= 35) || (k === "temperature" && (last >= 40 || last <= 10)) || (isBinary && last >= 1);
          return (
            <Card key={k} className="panel p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${danger ? "text-danger" : "text-primary"}`} />
                  <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{SENSOR_LABELS[k]}</span>
                </div>
                <div className={`h-2.5 w-2.5 rounded-full ${danger ? "bg-danger animate-blink" : "bg-safe glow-safe"}`} />
              </div>
              <div className={`font-mono text-3xl font-bold ${danger ? "text-danger" : ""}`}>
                {formatSensorValue(k, last)}
                {!isBinary && <span className="text-base text-muted-foreground ml-1">{SENSOR_UNITS[k]}</span>}
              </div>
              <div className="mt-3 h-12">
                <Sparkline data={arr.slice(-20)} color={danger ? "hsl(var(--danger))" : "hsl(var(--primary))"} domain={sparklineDomain(k)} />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid xl:grid-cols-[1.05fr_0.95fr] gap-6">
        <Card className="panel p-5 space-y-4">
          <div>
            <h3 className="text-sm font-mono tracking-wider text-muted-foreground">HOUSE ROOM LIBRARY</h3>
            <p className="text-sm text-muted-foreground mt-1">Save one baseline image per room so Guardian can remember your layout and use that context in chat and motion demos.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <Label>Room name</Label>
                <Input className="mt-2" value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Living Room" />
              </div>
              <div>
                <Label>Tags</Label>
                <Input className="mt-2" value={roomTagsInput} onChange={(event) => setRoomTagsInput(event.target.value)} placeholder="window, sofa, TV wall" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea className="mt-2 min-h-[96px]" value={roomNotes} onChange={(event) => setRoomNotes(event.target.value)} placeholder="Front window faces the driveway. Main doorway on the right." />
              </div>
              <div className="flex gap-2">
                <input ref={baselineFileRef} type="file" accept="image/*" className="hidden" onChange={(event) => onPickFile(event, setBaselineImage)} />
                <Button type="button" variant="outline" onClick={() => baselineFileRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-2" /> Upload baseline
                </Button>
                <Button type="button" onClick={saveRoom} disabled={savingRoom || !baselineImage || !roomName.trim()}>
                  {savingRoom ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanEye className="h-4 w-4 mr-2" />}
                  Save room
                </Button>
              </div>
              {baselineImage && (
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <img src={baselineImage.dataUrl} alt="Baseline room" className="h-16 w-16 rounded object-cover border" />
                  <div className="text-sm">
                    <div className="font-medium">{baselineImage.name}</div>
                    <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setBaselineImage(null)}>
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {savedRooms.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No saved rooms yet. Add a baseline room image first.</div>
              ) : (
                savedRooms.map((room) => (
                  <div key={room.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex gap-3">
                      <img src={room.imageDataUrl} alt={room.roomName} className="h-16 w-16 rounded object-cover border" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">{room.roomName}</div>
                            <div className="text-xs text-muted-foreground">{room.tags.join(", ") || "No tags"}</div>
                          </div>
                          <button className="text-muted-foreground hover:text-danger" onClick={() => deleteRoomSnapshot(room.id)} title="Delete room">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {room.aiSummary && <p className="text-xs text-muted-foreground mt-1">{room.aiSummary}</p>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        <Card className="panel p-5 space-y-4">
          <div>
            <h3 className="text-sm font-mono tracking-wider text-muted-foreground">MOTION DEMO</h3>
            <p className="text-sm text-muted-foreground mt-1">Pick a saved room, upload a current image, and Guardian will decide if a person is present and whether motion should alert.</p>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Saved room</Label>
              <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Choose a saved room" />
                </SelectTrigger>
                <SelectContent>
                  {savedRooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>{room.roomName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <input ref={motionFileRef} type="file" accept="image/*" className="hidden" onChange={(event) => onPickFile(event, setMotionImage)} />
              <Button type="button" variant="outline" onClick={() => motionFileRef.current?.click()}>
                <Camera className="h-4 w-4 mr-2" /> Upload current frame
              </Button>
              <Button type="button" onClick={runMotionDemo} disabled={runningMotionDemo || !selectedRoomId || !motionImage}>
                {runningMotionDemo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
                Run motion demo
              </Button>
            </div>

            {motionImage && (
              <div className="flex items-center gap-3 rounded-md border p-3">
                <img src={motionImage.dataUrl} alt="Motion demo frame" className="h-16 w-16 rounded object-cover border" />
                <div className="text-sm">
                  <div className="font-medium">{motionImage.name}</div>
                  <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setMotionImage(null)}>
                    Remove
                  </button>
                </div>
              </div>
            )}

            {motionResult && (
              <div className={`rounded-md border p-4 ${motionResult.should_alert ? "border-danger/50 bg-danger/10" : "border-safe/40 bg-safe/10"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{motionResult.should_alert ? "Motion Alert Triggered" : "No Motion Alert"}</div>
                  <div className="text-xs font-mono text-muted-foreground">{motionResult.confidence || "Medium"} confidence</div>
                </div>
                <p className="text-sm mt-2">{motionResult.summary}</p>
                {motionResult.evidence && motionResult.evidence.length > 0 && (
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                    {motionResult.evidence.map((item, index) => <li key={index}>- {item}</li>)}
                  </ul>
                )}
                {motionResult.recommended_action && <p className="text-xs mt-2">{motionResult.recommended_action}</p>}
              </div>
            )}

            <div className="rounded-md border p-4">
              <div className="text-xs font-mono tracking-wider text-muted-foreground mb-2">RECENT MOTION DEMOS</div>
              {motionEvents.length === 0 ? (
                <div className="text-sm text-muted-foreground">No motion demos yet.</div>
              ) : (
                <div className="space-y-2">
                  {motionEvents.slice(0, 5).map((event) => (
                    <div key={event.id} className="text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{event.roomName}</span>
                        <span className={`text-xs font-mono ${event.shouldAlert ? "text-danger" : "text-safe"}`}>
                          {event.shouldAlert ? "ALERT" : "CLEAR"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{event.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card className="panel p-5">
        <h3 className="text-sm font-mono tracking-wider text-muted-foreground mb-3">SIMULATE EVENTS</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={trigger.motion}><Activity className="h-4 w-4 mr-1" /> Trigger motion</Button>
          <Button variant="outline" size="sm" onClick={trigger.smoke}><Flame className="h-4 w-4 mr-1" /> Trigger smoke alarm</Button>
          <Button variant="outline" size="sm" onClick={trigger.co}><Wind className="h-4 w-4 mr-1" /> Trigger CO alert</Button>
          <Button variant="outline" size="sm" onClick={trigger.flood}><Waves className="h-4 w-4 mr-1" /> Trigger flood</Button>
          <Button variant="outline" size="sm" onClick={trigger.door}><DoorOpen className="h-4 w-4 mr-1" /> Toggle door</Button>
          <Button variant="outline" size="sm" onClick={trigger.tempHigh}><Zap className="h-4 w-4 mr-1" /> Spike temperature</Button>
        </div>
      </Card>

      <Card className="panel p-5">
        <h3 className="text-sm font-mono tracking-wider text-muted-foreground mb-3">EVENT LOG</h3>
        {alerts.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">No events yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-mono text-muted-foreground border-b">
                  <th className="py-2 pr-3">TIME</th>
                  <th className="py-2 pr-3">SENSOR</th>
                  <th className="py-2 pr-3">VALUE</th>
                  <th className="py-2 pr-3">LEVEL</th>
                  <th className="py-2">EVENT</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 25).map((a) => (
                  <tr key={a.id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground tabular-nums">{new Date(a.ts).toLocaleTimeString()}</td>
                    <td className="py-2 pr-3">{SENSOR_LABELS[a.sensor]}</td>
                    <td className="py-2 pr-3 font-mono">{typeof a.value === "number" ? a.value.toFixed(1) : a.value}</td>
                    <td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${severityClass(a.level)}`}>{a.level.toUpperCase()}</span></td>
                    <td className="py-2 text-xs">{a.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function parseTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

function formatSensorValue(sensor: SensorKey, value: number) {
  if (sensor === "flood") return value >= 1 ? "FLOOD ALERT" : "NO ALERT";
  if (sensor === "motion") return value >= 1 ? "MOTION" : "IDLE";
  if (sensor === "door") return value >= 1 ? "OPEN" : "CLOSED";
  return value.toFixed(sensor === "temperature" ? 1 : 0);
}

function sparklineDomain(sensor: SensorKey): [number, number] {
  if (sensor === "temperature") return [0, 50];
  if (sensor === "smoke") return [0, 100];
  if (sensor === "co") return [0, 60];
  return [0, 1];
}
