export const formatPlaytime = (hoursDecimal: number | undefined | null): string => {
  if (hoursDecimal === undefined || hoursDecimal === null || isNaN(hoursDecimal) || hoursDecimal < 0) {
    return "0H";
  }
  return `${Math.round(hoursDecimal)}H`;
};

export const formatPlaytimeLong = (hoursDecimal: number | undefined | null): string => {
  if (hoursDecimal === undefined || hoursDecimal === null || isNaN(hoursDecimal) || hoursDecimal < 0) {
    return "0 HOURS";
  }
  return `${Math.round(hoursDecimal)} HOURS`;
};

export const formatPlaytimePrecise = (hoursDecimal: number | undefined | null): string => {
  if (hoursDecimal === undefined || hoursDecimal === null || isNaN(hoursDecimal) || hoursDecimal < 0) {
    return "0H";
  }
  let h = Math.floor(hoursDecimal);
  let m = Math.round((hoursDecimal - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  if (m === 0) {
    return `${h}H`;
  }
  return `${h}H ${m}M`;
};
