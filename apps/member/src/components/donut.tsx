import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { usePalette } from "./palette";

export type DonutPart = { label: string; value: number; color: string };

/** The canvas ring chart: a total in the middle and a legend with a count per part. */
export function Donut({ parts, unit }: { parts: DonutPart[]; unit: string }) {
  const palette = usePalette();
  const total = parts.reduce((n, p) => n + p.value, 0);
  const r = 48;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View className="flex-row flex-wrap items-center gap-6">
      <View className="h-[124px] w-[124px] items-center justify-center">
        <Svg width={124} height={124} style={{ position: "absolute" }} aria-hidden>
          <Circle cx={62} cy={62} r={r} stroke={palette.surface2} strokeWidth={18} fill="none" />
          {total > 0
            ? parts.map((p) => {
                const length = (c * p.value) / total;
                const arc = (
                  <Circle
                    key={p.label}
                    cx={62}
                    cy={62}
                    r={r}
                    stroke={p.color}
                    strokeWidth={18}
                    fill="none"
                    strokeDasharray={`${length} ${c}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 62 62)"
                  />
                );
                offset += length;
                return arc;
              })
            : null}
        </Svg>
        <Text className="font-figtree-extrabold text-[28px] leading-[30px] text-ink">{total}</Text>
        <Text className="font-figtree text-[12px] text-ink-2">{unit}</Text>
      </View>
      <View className="min-w-[180px] flex-1">
        {parts.map((p, i) => (
          <View
            key={p.label}
            className={`min-h-[40px] flex-row items-center gap-2.5 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <View className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: p.color }} />
            <Text className="flex-1 font-figtree text-[14px] text-ink">{p.label}</Text>
            <Text className="font-figtree-extrabold text-[15px] text-ink">{p.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
