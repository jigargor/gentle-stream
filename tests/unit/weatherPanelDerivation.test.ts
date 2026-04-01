import { describe, expect, it } from "vitest";
import type { WeatherFillerData } from "@/lib/types";
import { getWeatherPanelIds } from "@/components/feed/WeatherCard";

function makeWeatherData(overrides: Partial<WeatherFillerData> = {}): WeatherFillerData {
  return {
    mode: "weather",
    title: "Weather Brief",
    subtitle: "",
    locationLabel: "San Jose, California, US",
    temperatureC: 20,
    condition: "clear sky",
    humidity: 55,
    windKph: 12,
    ...overrides,
  };
}

describe("getWeatherPanelIds", () => {
  it("always includes summary, details, and alerts for weather mode", () => {
    const panelIds = getWeatherPanelIds(makeWeatherData());
    expect(panelIds).toEqual(["summary", "details", "alerts"]);
  });

  it("adds alerts, hourly, and weekly panels only when data exists", () => {
    const panelIds = getWeatherPanelIds(
      makeWeatherData({
        alerts: [
          {
            title: "Wind Advisory",
            severity: "minor",
            startsAt: new Date().toISOString(),
            endsAt: new Date().toISOString(),
          },
        ],
        hourly: [{ isoTime: new Date().toISOString(), tempC: 22, condition: "clear" }],
        daily: [{ isoDate: new Date().toISOString(), minC: 14, maxC: 24, condition: "cloudy" }],
      })
    );
    expect(panelIds).toEqual(["summary", "details", "alerts", "hourly", "weekly"]);
  });

  it("returns no weather panels for generated-art mode", () => {
    const panelIds = getWeatherPanelIds({
      mode: "generated_art",
      title: "Forecast Desk",
      subtitle: "Fallback art",
      imageUrl: "https://example.com/fallback.jpg",
    });
    expect(panelIds).toEqual([]);
  });
});
