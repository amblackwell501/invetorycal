export type CalendarMoment = {
  id: string;
  type: "pickup" | "dropoff";
  isOverdue: boolean;
  title: string;
  start: Date;
  end: Date;
  borrowerName?: string;
  borrowerEmail?: string;
  itemNames: string[];
  sourceType: "reservation" | "checkout";
  sourceId: string;
  status: string;
  notes?: string;
};

export type CheqroomRecord = Record<string, unknown>;
