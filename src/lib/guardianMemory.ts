export type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
  attachmentLabel?: string | null;
};

export type SavedRoom = {
  id: string;
  roomName: string;
  tags: string[];
  notes: string;
  imageDataUrl: string;
  aiSummary?: string;
  observedFeatures?: string[];
  entryPoints?: string[];
  typicalRisks?: string[];
  createdAt: number;
  updatedAt: number;
};

export type MotionDemoEvent = {
  id: string;
  roomId: string;
  roomName: string;
  personDetected: boolean;
  shouldAlert: boolean;
  roomMatch: boolean;
  confidence: string;
  summary: string;
  recommendedAction?: string;
  createdAt: number;
};

type HouseMemory = {
  rooms: SavedRoom[];
  motionEvents: MotionDemoEvent[];
};

const CHAT_KEY = "guardian_chat_history_v1";
const HOUSE_KEY = "guardian_house_memory_v1";
const MEMORY_EVENT = "guardian-memory-changed";

export function loadStoredChatHistory() {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return [] as StoredChatMessage[];
    return JSON.parse(raw) as StoredChatMessage[];
  } catch {
    return [] as StoredChatMessage[];
  }
}

export function saveStoredChatHistory(messages: StoredChatMessage[]) {
  localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-60)));
  dispatchMemoryChanged();
}

export function clearStoredChatHistory() {
  localStorage.removeItem(CHAT_KEY);
  dispatchMemoryChanged();
}

export function loadHouseMemory(): HouseMemory {
  try {
    const raw = localStorage.getItem(HOUSE_KEY);
    if (!raw) return { rooms: [], motionEvents: [] };
    const parsed = JSON.parse(raw) as Partial<HouseMemory>;
    return {
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
      motionEvents: Array.isArray(parsed.motionEvents) ? parsed.motionEvents : [],
    };
  } catch {
    return { rooms: [], motionEvents: [] };
  }
}

export function saveRoomSnapshot(room: Omit<SavedRoom, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  const memory = loadHouseMemory();
  const now = Date.now();
  const nextRoom: SavedRoom = {
    ...room,
    id: room.id ?? crypto.randomUUID(),
    createdAt: room.id ? memory.rooms.find((item) => item.id === room.id)?.createdAt ?? now : now,
    updatedAt: now,
  };
  const rooms = [nextRoom, ...memory.rooms.filter((item) => item.id !== nextRoom.id)].slice(0, 12);
  saveHouseMemory({ ...memory, rooms });
  return nextRoom;
}

export function deleteRoomSnapshot(id: string) {
  const memory = loadHouseMemory();
  saveHouseMemory({
    rooms: memory.rooms.filter((room) => room.id !== id),
    motionEvents: memory.motionEvents.filter((event) => event.roomId !== id),
  });
}

export function recordMotionDemoEvent(event: Omit<MotionDemoEvent, "id" | "createdAt">) {
  const memory = loadHouseMemory();
  const nextEvent: MotionDemoEvent = {
    ...event,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  saveHouseMemory({
    ...memory,
    motionEvents: [nextEvent, ...memory.motionEvents].slice(0, 20),
  });
  return nextEvent;
}

export function clearHouseMemory() {
  localStorage.removeItem(HOUSE_KEY);
  dispatchMemoryChanged();
}

export function subscribeGuardianMemory(handler: () => void) {
  window.addEventListener(MEMORY_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(MEMORY_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function saveHouseMemory(memory: HouseMemory) {
  localStorage.setItem(HOUSE_KEY, JSON.stringify(memory));
  dispatchMemoryChanged();
}

function dispatchMemoryChanged() {
  window.dispatchEvent(new CustomEvent(MEMORY_EVENT));
}
