import { getLang } from ".";

/** Reference text for every editable parameter, shown in edit mode. */
export interface ParamDoc {
  what: string;
  effect: string;
  range: string;
  formula?: string;
}

export type DocId =
  | "machine.topRollD"
  | "machine.bottomRollD"
  | "machine.sideRollD"
  | "machine.maxThickness"
  | "machine.maxWidth"
  | "machine.minDiameter"
  | "process.flatEndFactor"
  | "process.calibration"
  | "process.springbackWarn"
  | "mat.name"
  | "mat.number"
  | "mat.group"
  | "mat.standard"
  | "mat.yield"
  | "mat.rm"
  | "mat.modulus"
  | "mat.poisson"
  | "mat.density"
  | "mat.minRt"
  | "mat.strainLimit"
  | "cal.material"
  | "cal.thickness"
  | "cal.reActual"
  | "cal.setInnerD"
  | "cal.measuredInnerD"
  | "cal.factor"
  | "tpl.name";

const pl: Record<DocId, ParamDoc> = {
  "machine.topRollD": {
    what: "Średnica walca górnego. W walcarce czterowalcowej to walec, który przy walcowaniu znajduje się wewnątrz zwijanego płaszcza.",
    effect:
      "Sprawdzenie minimalnej średnicy: ostrzeżenie, gdy Ø wewnętrzna detalu nie mieści walca górnego. Rozmiar walców w widoku 3D. Nie zmienia długości blachy.",
    range: "Typowo 100–1000 mm. Puste pole = brak sprawdzenia, walce w 3D rysowane symbolicznie.",
    formula: "Warunek: Di > D_góra\nW praktyce potrzebny zapas: Di ≥ (1,1…1,2) · D_góra",
  },
  "machine.bottomRollD": {
    what: "Średnica walca dolnego (dociskowego), który wraz z górnym zaciska blachę.",
    effect: "Tylko widok 3D. Nie wpływa na obliczenia.",
    range: "Typowo 0,8–1,0 × Ø walca górnego. Puste = wartość symboliczna.",
  },
  "machine.sideRollD": {
    what: "Średnica walców bocznych, które gną blachę, ustawiając promień.",
    effect: "Tylko widok 3D. Nie wpływa na obliczenia.",
    range: "Typowo 0,6–0,9 × Ø walca górnego. Puste = wartość symboliczna.",
  },
  "machine.maxThickness": {
    what: "Maksymalna grubość blachy z tabliczki lub dokumentacji maszyny.",
    effect:
      "Ostrzeżenie, gdy grubość przekracza limit. Nominalna nośność dotyczy zwykle stali o Re ≈ 235–275 MPa na pełnej szerokości, więc dla mocniejszych gatunków realny limit jest mniejszy.",
    range: "Typowo 3–150 mm. Puste = brak sprawdzenia.",
    formula:
      "Przybliżony limit dla innego Re (równy moment gnący):\nt_dop ≈ t_max · √(Re_ref / Re)",
  },
  "machine.maxWidth": {
    what: "Maksymalna szerokość blachy, czyli długość robocza walców.",
    effect:
      "Ostrzeżenie, gdy szerokość blachy (walec) lub długość tworzącej (stożek) przekracza limit.",
    range: "Typowo 1000–4000 mm. Puste = brak sprawdzenia.",
  },
  "machine.minDiameter": {
    what: "Najmniejsza wewnętrzna średnica, jaką maszyna może zwinąć, z dokumentacji producenta.",
    effect: "Ostrzeżenie, gdy Ø wewnętrzna detalu (dla stożka: mały koniec) jest mniejsza.",
    range: "Zwykle 1,1–1,5 × Ø walca górnego. Puste = brak sprawdzenia.",
  },
  "process.flatEndFactor": {
    what: "Długość niedogiętego, płaskiego końca blachy po zawijaniu, jako krotność grubości.",
    effect:
      "Wartość automatyczna pola „Płaski koniec” w kalkulatorze, gdy naddatek jest włączony. Zwiększa długość cięcia o dwa końce. Przy wyłączonym naddatku nie ma wpływu.",
    range:
      "0–20. Czterowalcowa z zawijaniem: zwykle 0,5–2. Trzywalcowa: około połowy rozstawu walców dolnych.",
    formula: "f = k_f · t\nL_cięcia = π · Dn + 2 · f",
  },
  "process.calibration": {
    what: "Domyślny współczynnik skalujący przewidywane sprężynowanie.",
    effect:
      "Ø nastawcza w kalkulatorze, gdy pole współczynnika jest puste i dla materiału nie ma prób kalibracyjnych. Nie zmienia długości blachy.",
    range: "0–3. 1 = sam model. Typowo po kalibracji 0,7–1,3.",
    formula: "Rs = Rf − c · (Rf − Rm)\nRs – promień nastawczy, Rf – docelowy, Rm – z modelu",
  },
  "process.springbackWarn": {
    what: "Próg, powyżej którego kalkulator ostrzega o dużym sprężynowaniu.",
    effect:
      "Tylko ostrzeżenie. Duże sprężynowanie oznacza, że wynik silnie zależy od rzeczywistego Re.",
    range: "1–99 %. Domyślnie 30 %.",
    formula: "(Rf − Rs) / Rf > próg",
  },
  "mat.name": {
    what: "Oznaczenie gatunku wg normy, np. S355J2 albo X2CrNiMo17-12-2 (316L).",
    effect: "Lista materiałów, raport PDF, historia. Nie wpływa na obliczenia.",
    range: "Wymagane, unikalne w bazie.",
  },
  "mat.number": {
    what: "Numer materiałowy wg EN 10027-2 (np. 1.0577) lub oznaczenie stopu aluminium (np. AlMg4,5Mn0,7).",
    effect: "Tylko opis na liście i w raporcie.",
    range: "Opcjonalne.",
  },
  "mat.group": {
    what: "Grupa, w której materiał pokazuje się na liście wyboru.",
    effect: "Tylko porządek listy.",
    range: "Jedna z pięciu grup.",
  },
  "mat.standard": {
    what: "Norma lub dokument, z którego pochodzą wartości, np. EN 10025-2:2019 albo karta producenta.",
    effect: "Wyświetlane pod wyborem materiału. Ułatwia sprawdzenie źródła danych.",
    range: "Opcjonalne, ale zalecane.",
  },
  "mat.yield": {
    what: "Minimalna granica plastyczności (ReH lub Rp0,2) w pasmach grubości, jak w tabelach norm. Ostatnie pasmo może nie mieć limitu.",
    effect:
      "Tylko sprężynowanie i Ø nastawcza. Długość blachy od Re nie zależy. Gdy w kalkulatorze wpiszesz Re z atestu, zastępuje ono tę wartość.",
    range: "20–1500 MPa. Limity grubości rosnące, Re nie może przekraczać Rm max.",
    formula: "x = Ri · Re / (E' · t)\nRi / Rf = 4x³ − 3x + 1",
  },
  "mat.rm": {
    what: "Zakres wytrzymałości na rozciąganie Rm z normy.",
    effect:
      "Informacja i kontrola danych (Re musi być mniejsze od Rm max). Nie wpływa na obliczenia.",
    range: "Rm min < Rm max, typowo 150–1200 MPa.",
  },
  "mat.modulus": {
    what: "Moduł sprężystości (Younga), sztywność materiału w zakresie sprężystym.",
    effect: "Sprężynowanie: im mniejszy E, tym większe sprężynowanie. Długość blachy bez zmian.",
    range: "Stal 200–210 GPa, nierdzewna austenityczna 193–200 GPa, aluminium 68–72 GPa.",
    formula: "E' = E / (1 − ν²)   (płaski stan odkształcenia, szeroka blacha)",
  },
  "mat.poisson": {
    what: "Liczba Poissona, poprzeczne odkształcenie przy rozciąganiu.",
    effect: "Niewielka poprawka modułu w sprężynowaniu (płaski stan odkształcenia).",
    range: "0,25–0,35. Stal 0,30, aluminium 0,33.",
    formula: "E' = E / (1 − ν²)",
  },
  "mat.density": {
    what: "Gęstość materiału.",
    effect: "Tylko masa detalu.",
    range: "Aluminium ~2650–2700, stal ~7850, nierdzewna 7800–8000 kg/m³.",
    formula: "m = A · t · ρ   (A – pole rozwinięcia)",
  },
  "mat.minRt": {
    what: "Orientacyjny najmniejszy stosunek promienia wewnętrznego do grubości przy walcowaniu na zimno.",
    effect: "Ostrzeżenie, gdy R/t detalu jest mniejsze. Nie blokuje obliczeń.",
    range: "0,5–10. Stale miękkie ~1, wysokowytrzymałe 2–3.",
    formula: "R/t = ri / t",
  },
  "mat.strainLimit": {
    what: "Odkształcenie włókna zewnętrznego, powyżej którego przepisy (np. EN 13445-4) mogą wymagać obróbki cieplnej po kształtowaniu na zimno.",
    effect: "Ostrzeżenie w kalkulatorze. Puste pole = brak ostrzeżenia.",
    range: "1–30 %. Stale ferrytyczne 5 %, duplex 10 %, austenityczne 15 %.",
    formula: "ε = t / (2 · ri + t)",
  },
  "cal.material": {
    what: "Materiał próbki. Współczynnik z prób jest przypisany do materiału.",
    effect:
      "Średnia z prób danego materiału staje się jego współczynnikiem sprężynowania w kalkulatorze.",
    range: "Dowolny materiał z bazy.",
  },
  "cal.thickness": {
    what: "Grubość blachy próbki.",
    effect: "Przeliczenie średnic wewnętrznych na promienie osi obojętnej i model sprężynowania.",
    range: "> 0 mm. Najlepiej grubość, którą najczęściej walcujesz w tym gatunku.",
  },
  "cal.reActual": {
    what: "Granica plastyczności z atestu partii, z której pochodzi próbka.",
    effect:
      "Model porównawczy. Puste = minimum z normy dla tej grubości. Atest daje dokładniejszy współczynnik.",
    range: "Wartość z atestu 3.1, MPa.",
  },
  "cal.setInnerD": {
    what: "Średnica wewnętrzna zaprogramowana (ustawiona) na maszynie przy walcowaniu próbki.",
    effect: "Punkt odniesienia do wyliczenia rzeczywistego sprężynowania.",
    range: "> 0 mm, mniejsza od zmierzonej.",
  },
  "cal.measuredInnerD": {
    what: "Średnica wewnętrzna zmierzona po walcowaniu i zdjęciu z maszyny. Najdokładniej: obwód zewnętrzny taśmą.",
    effect: "Rzeczywiste sprężynowanie próbki.",
    range: "Większa od nastawionej (blacha zawsze odbija na zewnątrz).",
    formula: "Z obwodu zewnętrznego C:  Di = C / π − 2 · t",
  },
  "cal.factor": {
    what: "Współczynnik kalibracji: stosunek rzeczywistego sprężynowania do przewidzianego przez model.",
    effect:
      "Średnia z prób danego materiału jest automatycznie używana w kalkulatorze, chyba że wpiszesz współczynnik ręcznie.",
    range: "Typowo 0,5–1,5. Wartości spoza tego zakresu oznaczają zwykle błąd pomiaru lub nastawy.",
    formula:
      "c = (Rf − Rs) / (Rf − Rm)\nRf – zmierzony, Rs – nastawiony, Rm – z modelu (promienie osi obojętnej)",
  },
  "tpl.name": {
    what: "Nazwa szablonu widoczna na przycisku w kalkulatorze.",
    effect:
      "Szablon wczytuje zapisane dane wejściowe jednym dotknięciem. Naddatek na płaskie końce zawsze startuje wyłączony.",
    range: "1–40 znaków.",
  },
};

const en: Record<DocId, ParamDoc> = {
  "machine.topRollD": {
    what: "Top roll diameter. On a 4-roll machine this roll sits inside the shell being rolled.",
    effect:
      "Minimum diameter check: warning when the part's inner Ø does not clear the top roll. Roll size in the 3D view. Does not change the blank length.",
    range: "Typically 100–1000 mm. Empty = no check, symbolic rolls in 3D.",
    formula: "Condition: Di > D_top\nIn practice keep a margin: Di ≥ (1.1…1.2) · D_top",
  },
  "machine.bottomRollD": {
    what: "Bottom (pinch) roll diameter; together with the top roll it grips the plate.",
    effect: "3D view only. No effect on calculations.",
    range: "Typically 0.8–1.0 × top roll Ø. Empty = symbolic value.",
  },
  "machine.sideRollD": {
    what: "Side roll diameter; side rolls bend the plate and set the radius.",
    effect: "3D view only. No effect on calculations.",
    range: "Typically 0.6–0.9 × top roll Ø. Empty = symbolic value.",
  },
  "machine.maxThickness": {
    what: "Maximum plate thickness from the machine plate or documentation.",
    effect:
      "Warning when the thickness exceeds it. The rated capacity usually refers to steel with Re ≈ 235–275 MPa at full width; stronger grades lower the real limit.",
    range: "Typically 3–150 mm. Empty = no check.",
    formula:
      "Approximate limit for another Re (equal bending moment):\nt_allow ≈ t_max · √(Re_ref / Re)",
  },
  "machine.maxWidth": {
    what: "Maximum plate width, i.e. the working length of the rolls.",
    effect: "Warning when the plate width (cylinder) or generator length (cone) exceeds it.",
    range: "Typically 1000–4000 mm. Empty = no check.",
  },
  "machine.minDiameter": {
    what: "Smallest inner diameter the machine can roll, from the maker's documentation.",
    effect: "Warning when the part's inner Ø (cone: small end) is smaller.",
    range: "Usually 1.1–1.5 × top roll Ø. Empty = no check.",
  },
  "process.flatEndFactor": {
    what: "Length of the unbent flat end left after pre-bending, as a multiple of thickness.",
    effect:
      "Automatic value of the calculator's “Flat end” field while the allowance is on. Adds both ends to the cut length. No effect while the allowance is off.",
    range:
      "0–20. 4-roll with pre-bending: usually 0.5–2. 3-roll: about half the bottom roll spacing.",
    formula: "f = k_f · t\nL_cut = π · Dn + 2 · f",
  },
  "process.calibration": {
    what: "Default factor scaling the predicted springback.",
    effect:
      "Set Ø in the calculator when its factor field is empty and the material has no calibration trials. Does not change the blank length.",
    range: "0–3. 1 = model as-is. Typically 0.7–1.3 after calibration.",
    formula: "Rs = Rf − c · (Rf − Rm)\nRs – set radius, Rf – target, Rm – model",
  },
  "process.springbackWarn": {
    what: "Threshold above which the calculator warns about large springback.",
    effect: "Warning only. Large springback means the result depends strongly on the actual Re.",
    range: "1–99 %. Default 30 %.",
    formula: "(Rf − Rs) / Rf > threshold",
  },
  "mat.name": {
    what: "Grade designation per standard, e.g. S355J2 or X2CrNiMo17-12-2 (316L).",
    effect: "Material list, PDF report, history. No effect on calculations.",
    range: "Required, unique in the database.",
  },
  "mat.number": {
    what: "Material number per EN 10027-2 (e.g. 1.0577) or aluminium alloy designation (e.g. AlMg4.5Mn0.7).",
    effect: "Label in the list and report only.",
    range: "Optional.",
  },
  "mat.group": {
    what: "Group the material is listed under.",
    effect: "List order only.",
    range: "One of five groups.",
  },
  "mat.standard": {
    what: "Standard or document the values come from, e.g. EN 10025-2:2019 or a mill data sheet.",
    effect: "Shown under the material selector, so the data source can be checked.",
    range: "Optional but recommended.",
  },
  "mat.yield": {
    what: "Minimum yield strength (ReH or Rp0.2) in thickness bands, as in the standard tables. The last band may be open-ended.",
    effect:
      "Springback and set Ø only. The blank length does not depend on Re. A certificate Re entered in the calculator replaces it.",
    range: "20–1500 MPa. Thickness limits increasing; Re must stay below Rm max.",
    formula: "x = Ri · Re / (E' · t)\nRi / Rf = 4x³ − 3x + 1",
  },
  "mat.rm": {
    what: "Tensile strength range Rm from the standard.",
    effect: "Information and data check (Re must be below Rm max). No effect on calculations.",
    range: "Rm min < Rm max, typically 150–1200 MPa.",
  },
  "mat.modulus": {
    what: "Young's modulus, the material's stiffness in the elastic range.",
    effect: "Springback: lower E means more springback. Blank length unchanged.",
    range: "Steel 200–210 GPa, austenitic stainless 193–200 GPa, aluminium 68–72 GPa.",
    formula: "E' = E / (1 − ν²)   (plane strain, wide plate)",
  },
  "mat.poisson": {
    what: "Poisson's ratio, the lateral strain under tension.",
    effect: "Small modulus correction in springback (plane strain).",
    range: "0.25–0.35. Steel 0.30, aluminium 0.33.",
    formula: "E' = E / (1 − ν²)",
  },
  "mat.density": {
    what: "Material density.",
    effect: "Part mass only.",
    range: "Aluminium ~2650–2700, steel ~7850, stainless 7800–8000 kg/m³.",
    formula: "m = A · t · ρ   (A – development area)",
  },
  "mat.minRt": {
    what: "Indicative smallest inner radius to thickness ratio for cold rolling.",
    effect: "Warning when the part's R/t is lower. Does not block the calculation.",
    range: "0.5–10. Mild steels ~1, high-strength 2–3.",
    formula: "R/t = ri / t",
  },
  "mat.strainLimit": {
    what: "Outer fibre strain above which codes (e.g. EN 13445-4) may require heat treatment after cold forming.",
    effect: "Calculator warning. Empty = no warning.",
    range: "1–30 %. Ferritic 5 %, duplex 10 %, austenitic 15 %.",
    formula: "ε = t / (2 · ri + t)",
  },
  "cal.material": {
    what: "Material of the trial part. The calibration factor belongs to the material.",
    effect: "The mean of a material's trials becomes its springback factor in the calculator.",
    range: "Any material in the database.",
  },
  "cal.thickness": {
    what: "Plate thickness of the trial part.",
    effect: "Converts inner diameters to neutral radii and feeds the springback model.",
    range: "> 0 mm. Ideally the thickness you roll most in this grade.",
  },
  "cal.reActual": {
    what: "Yield strength from the certificate of the batch the trial came from.",
    effect:
      "Reference model. Empty = standard minimum for this thickness. The certificate value gives a more accurate factor.",
    range: "Value from the 3.1 certificate, MPa.",
  },
  "cal.setInnerD": {
    what: "Inner diameter programmed (set) on the machine when rolling the trial.",
    effect: "Reference for the real springback.",
    range: "> 0 mm, smaller than the measured one.",
  },
  "cal.measuredInnerD": {
    what: "Inner diameter measured after rolling and release. Most accurate: outer circumference with a tape.",
    effect: "Real springback of the trial.",
    range: "Larger than the set one (the plate always opens up).",
    formula: "From outer circumference C:  Di = C / π − 2 · t",
  },
  "cal.factor": {
    what: "Calibration factor: real springback divided by the model's prediction.",
    effect:
      "The mean over a material's trials is used automatically in the calculator unless a factor is typed in.",
    range: "Typically 0.5–1.5. Values outside usually mean a measuring or setting error.",
    formula: "c = (Rf − Rs) / (Rf − Rm)\nRf – measured, Rs – set, Rm – model (neutral radii)",
  },
  "tpl.name": {
    what: "Template name shown on its button in the calculator.",
    effect:
      "A template loads its saved inputs in one tap. The flat-end allowance always starts off.",
    range: "1–40 characters.",
  },
};

export function paramDoc(id: DocId): ParamDoc {
  return (getLang() === "pl" ? pl : en)[id];
}
