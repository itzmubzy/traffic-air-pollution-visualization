// data.js

export async function loadData() {
    const parseDate = d3.timeParse("%Y-%m-%d");

    const data = await d3.csv("traffic_air_pollution_cleaned_features.csv", d => {
        // Parse and coerce types
        return {
            ...d,
            Date: parseDate(d.Date),
            Year: +d.Year,
            Month: +d.Month,
            State_Code: +d.State_Code,
            Avg_Daily_Traffic: d.Avg_Daily_Traffic ? +d.Avg_Daily_Traffic : null,
            Avg_PM2_5: d.Avg_PM2_5 ? +d.Avg_PM2_5 : null,
            Avg_AQI: d.Avg_AQI ? +d.Avg_AQI : null,
            Traffic_Volatility: d.Traffic_Volatility ? +d.Traffic_Volatility : null,
            Traffic_per_1000: d.Traffic_per_1000 ? +d.Traffic_per_1000 : null,
            Emission_Efficiency_Index: d.Emission_Efficiency_Index ? +d.Emission_Efficiency_Index : null,
            PM2_5_YoY_Change: d.PM2_5_YoY_Change ? +d.PM2_5_YoY_Change : null,
            Emission_Efficiency_YoY_Change: d.Emission_Efficiency_YoY_Change ? +d.Emission_Efficiency_YoY_Change : null,
            PM2_5_outlier_flag: d.PM2_5_outlier_flag === "True",
            Traffic_outlier_flag: d.Traffic_outlier_flag === "True"
        };
    });
    
    return data;
}
