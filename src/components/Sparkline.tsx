import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";

interface Props {
  data: { value: number }[];
  color?: string;
  domain?: [number, number];
}

export function Sparkline({ data, color = "hsl(var(--primary))", domain }: Props) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        <YAxis hide domain={domain ?? ["dataMin - 1", "dataMax + 1"]} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
