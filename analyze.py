import pandas as pd
import json
import os

file_path = "traffic_air_pollution_cleaned_features.csv"
file_size = os.path.getsize(file_path)

df = pd.read_csv(file_path)

stats = {}
stats["file_info"] = {
    "filename": file_path,
    "size": file_size,
    "rows": len(df),
    "columns": len(df.columns),
    "candidate_files": 1,
}

col_inventory = []
for col in df.columns:
    missing = int(df[col].isnull().sum())
    missing_pct = missing / len(df) * 100
    unique_vals = int(df[col].nunique())
    example_vals = df[col].dropna().unique()[:2].tolist()
    example_vals_str = ", ".join(map(str, example_vals))
    col_inventory.append({
        "column": col,
        "dtype": str(df[col].dtype),
        "missing": missing,
        "missing_pct": round(missing_pct, 2),
        "unique": unique_vals,
        "example": example_vals_str
    })
stats["column_inventory"] = col_inventory

# Dates
if 'Date' in df.columns:
    df['Date'] = pd.to_datetime(df['Date'])
    stats["dates"] = {
        "min": str(df['Date'].min().date()),
        "max": str(df['Date'].max().date()),
        "unique_years": df['Date'].dt.year.unique().tolist(),
        "unique_months": df['Date'].dt.month.unique().tolist(),
        "total_months": int(df['Date'].dt.month.nunique())
    }
else:
    stats["dates"] = None

# Geog
if 'State_Name' in df.columns and 'State_Code' in df.columns:
    stats["geography"] = {
        "unique_states": int(df['State_Name'].nunique()),
        "state_names": df['State_Name'].dropna().unique().tolist(),
        "state_codes": df['State_Code'].dropna().unique().tolist()
    }

# Duplicates
stats["duplicates"] = {
    "total": int(df.duplicated().sum()),
    "state_date": int(df.duplicated(subset=['State_Name', 'Date']).sum()) if 'State_Name' in df.columns and 'Date' in df.columns else 0,
    "state_year_month": int(df.duplicated(subset=['State_Name', 'Year', 'Month']).sum()) if all(c in df.columns for c in ['State_Name', 'Year', 'Month']) else 0
}

# Missing specifics
missing_cols = ["Avg_Daily_Traffic", "Avg_PM2_5", "Avg_AQI", "Emission_Efficiency_Index", "Traffic_per_1000", "Traffic_Volatility", "Station_Coverage_Ratio", "PM25_Obs_Coverage", "AQI_Category"]
stats["missing_specifics"] = {}
for c in missing_cols:
    if c in df.columns:
        stats["missing_specifics"][c] = {
            "missing": int(df[c].isnull().sum()),
            "pct": round(df[c].isnull().sum() / len(df) * 100, 2)
        }

# Data distribution
dist_cols = ["Avg_Daily_Traffic", "Avg_PM2_5", "Avg_AQI", "Traffic_Volatility", "Traffic_per_1000", "Emission_Efficiency_Index"]
stats["distributions"] = {}
for c in dist_cols:
    if c in df.columns:
        desc = df[c].describe()
        stats["distributions"][c] = {
            "min": round(desc['min'], 2) if not pd.isna(desc['min']) else None,
            "max": round(desc['max'], 2) if not pd.isna(desc['max']) else None,
            "mean": round(desc['mean'], 2) if not pd.isna(desc['mean']) else None,
            "median": round(desc['50%'], 2) if not pd.isna(desc['50%']) else None,
            "std": round(desc['std'], 2) if not pd.isna(desc['std']) else None
        }

# State coverage
stats["state_coverage"] = {}
if 'State_Name' in df.columns and 'Date' in df.columns:
    coverage = df.groupby('State_Name').agg(
        first_date=('Date', 'min'),
        last_date=('Date', 'max'),
        count=('Date', 'count')
    )
    for state, row in coverage.iterrows():
        stats["state_coverage"][state] = {
            "first_date": str(row['first_date'].date()),
            "last_date": str(row['last_date'].date()),
            "count": int(row['count'])
        }

# Outliers
outlier_flags = ["PM2_5_outlier_flag", "Traffic_outlier_flag"]
stats["outliers"] = {}
for c in outlier_flags:
    if c in df.columns:
        stats["outliers"][c] = {
            "count": int(df[c].eq(True).sum()),
            "pct": round(df[c].eq(True).sum() / len(df) * 100, 2)
        }

with open("stats.json", "w") as f:
    json.dump(stats, f)
print("Stats saved to stats.json")
