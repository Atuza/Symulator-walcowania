import { getLang } from ".";

/**
 * Reference text for every editable parameter, shown in edit mode.
 * Formulas use the small TeX-like notation of ui/math.ts; symbols pair a formula symbol with its meaning.
 */
export interface ParamDoc {
  what: string;
  effect: string;
  range: string;
  formula?: string[];
  symbols?: [string, string][];
  example?: string;
  tip?: string;
  source?: string;
}

export type DocId =
  | "machine.topRollD"
  | "machine.bottomRollD"
  | "machine.sideRollD"
  | "machine.maxThickness"
  | "machine.maxWidth"
  | "machine.minDiameter"
  | "machine.rollLength"
  | "machine.charts"
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

const SPRINGBACK = [
  "x = \\frac{R_s \\cdot R_e}{E' \\cdot t}",
  "\\frac{R_s}{R_f} = 4 x^3 - 3 x + 1",
];
const PLANE_STRAIN = "E' = \\frac{E}{1 - \\nu^2}";

const pl: Record<DocId, ParamDoc> = {
  "machine.topRollD": {
    what: "Średnica górnego walca roboczego. W walcarce czterowalcowej blacha jest zaciśnięta między walcem górnym a dolnym, a walce boczne ją wyginają. Walec górny zostaje wewnątrz zwijanego płaszcza, dlatego to on wyznacza najmniejszą średnicę, jaką da się zwinąć.",
    effect:
      "Kontrola wykonalności: ostrzeżenie, gdy średnica do ustawienia na maszynie (po kompensacji sprężynowania) nie mieści walca górnego. Rozmiar walców w widoku 3D. Nie zmienia długości blachy ani sprężynowania.",
    range: "Stałe 338,38 mm (promień 169,19 mm) dla tej maszyny. Wartość tylko do odczytu.",
    formula: ["D_s > D_g", "D_{s,\\min} \\approx (1,1 \\ldots 1,2) \\cdot D_g"],
    symbols: [
      [
        "D_s",
        "średnica wewnętrzna do ustawienia na maszynie (mniejsza od końcowej, bo blacha odbija)",
      ],
      ["D_g", "średnica walca górnego"],
    ],
    tip: "Ponieważ płaszcz po zdjęciu z walców się rozszerza, na maszynie zwija się go ciaśniej niż wymiar końcowy. Dlatego aplikacja porównuje z walcem średnicę nastawczą, a nie docelową.",
  },
  "machine.bottomRollD": {
    what: "Średnica dolnego walca zaciskowego. Razem z walcem górnym trzyma i przesuwa blachę, więc w walcarce czterowalcowej arkusz nie ślizga się, a zawijanie obu końców odbywa się bez przekładania.",
    effect: "Tylko rozmiar walca w widoku 3D. Nie wpływa na obliczenia.",
    range: "Stałe 310,12 mm (promień 155,06 mm) dla tej maszyny. Wartość tylko do odczytu.",
  },
  "machine.sideRollD": {
    what: "Średnica walców bocznych (gnących). Podniesienie walca bocznego względem linii zacisku ustala krzywiznę: im wyżej, tym mniejszy promień. Jeden walec boczny gnie, drugi podpiera i prowadzi blachę, a przy zawijaniu drugiego końca role się zamieniają.",
    effect:
      "Tylko rozmiar walców w widoku 3D. Położenie walców bocznych zależy od geometrii konkretnej maszyny i nie jest tu liczone.",
    range: "Stałe 240,02 mm (promień 120,01 mm) dla obu walców bocznych. Wartość tylko do odczytu.",
  },
  "machine.maxThickness": {
    what: "Największa grubość, jaką maszyna zwija na pełnej szerokości, wg danych maszyny. Producent podaje ją dla określonej granicy plastyczności (zwykle stal o Re około 235–275 MPa) i zwykle dla określonej średnicy.",
    effect:
      "Ostrzeżenie przy przekroczeniu. Moment potrzebny do uplastycznienia przekroju rośnie z kwadratem grubości oraz liniowo z Re i szerokością, więc mocniejszy materiał zmniejsza dopuszczalną grubość, a węższa blacha ją zwiększa.",
    range: "Typowo 3–150 mm. Puste pole: brak kontroli.",
    formula: [
      "M_{\\text{pl}} = R_e \\cdot \\frac{b \\cdot t^2}{4}",
      "t_{\\text{dop}} \\approx t_{\\text{max}} \\cdot \\sqrt{\\frac{R_{e,\\text{ref}}}{R_e}}",
    ],
    symbols: [
      ["M_{\\text{pl}}", "moment uplastyczniający cały przekrój blachy"],
      ["b", "szerokość blachy (długość walcowania)"],
      ["t", "grubość blachy"],
      ["R_e", "granica plastyczności walcowanego materiału"],
      ["R_{e,\\text{ref}}", "Re, dla którego producent podał nośność"],
    ],
    example:
      "Maszyna 20 mm dla Re 235 MPa, blacha S355 (355 MPa) na pełnej szerokości: t_dop ≈ 20 · √(235/355) ≈ 16,3 mm.",
  },
  "machine.maxWidth": {
    what: "Maksymalna szerokość blachy dopuszczona dla tej maszyny: 3000 mm. Jest mniejsza od długości roboczej walców 3100 mm.",
    effect:
      "Ostrzeżenie, gdy szerokość blachy (walec) albo długość tworzącej (stożek) przekracza limit. Rozwinięcie stożka leży w walcach wzdłuż tworzącej, więc to ona jest potrzebną długością roboczą.",
    range: "Stałe 3000 mm, z dokumentacji maszyny. Wartość tylko do odczytu.",
    formula: ["s = \\frac{H}{\\cos \\alpha}"],
    symbols: [
      ["s", "długość tworzącej stożka"],
      ["H", "wysokość stożka (osiowa)"],
      ["\\alpha", "kąt połówkowy stożka"],
    ],
  },
  "machine.minDiameter": {
    what: "Najmniejsza średnica wewnętrzna z dokumentacji producenta, zwykle podana dla maksymalnej grubości.",
    effect:
      "Ostrzeżenie, gdy średnica do ustawienia na maszynie (po kompensacji sprężynowania) jest mniejsza. Dla stożka sprawdzany jest mały koniec.",
    range: "Zwykle 1,1–1,5 × Ø walca górnego. Puste pole: brak kontroli.",
  },
  "machine.rollLength": {
    what: "Długość robocza walców tej maszyny wynosi 3100 mm. Maksymalna dopuszczona szerokość blachy wynosi 3000 mm.",
    effect:
      "Reguła dla stożków: im dłuższa tworząca w stosunku do walców, tym mniejszy dopuszczalny udział grubości nominalnej (50 % do ½ długości, 40 % do ¾, 30 % powyżej).",
    range: "Stałe 3100 mm dla tej maszyny. Wartość tylko do odczytu.",
    formula: [
      "t_{stożek} \\le u \\cdot t_{nom}",
      "u = 0{,}5 \\quad s \\le 0{,}5 \\cdot L_w",
      "u = 0{,}4 \\quad s \\le 0{,}75 \\cdot L_w",
      "u = 0{,}3 \\quad s > 0{,}75 \\cdot L_w",
    ],
    symbols: [
      [
        "t_{nom}",
        "grubość z karty zwijania dla małej średnicy stożka (bez karty: maks. grubość maszyny)",
      ],
      ["s", "długość tworzącej stożka"],
      ["L_w", "długość robocza walców"],
    ],
    source: "zalecenia producentów walcarek czterowalcowych dotyczące zwijania stożków",
  },
  "machine.charts": {
    what: "Tabele producenta z maksymalną grubością blachy dla danej szerokości i średnicy wewnętrznej, osobno dla zwijania i dla podginania końców, każda dla jednej granicy plastyczności (np. 260 i 360 MPa).",
    effect:
      "Ostrzeżenie, gdy grubość przekracza wartość odczytaną z karty dla szerokości blachy i średnicy do ustawienia. Między wierszami i kolumnami interpolacja liniowa; między kartami liniowo po Re; dla materiału mocniejszego niż wszystkie karty skalowanie pierwiastkiem. Przekroczenie karty podginania przy włączonym naddatku na płaskie końce jest tylko informacją.",
    range:
      "Wartości przepisane z dokumentacji maszyny. Węższa blacha czyta pierwszy wiersz, większa średnica ostatnią kolumnę (bezpiecznie). Średnica poniżej karty: brak odczytu.",
    formula: ["t_{max}(R_e) = t_{karta} \\cdot \\sqrt{\\frac{R_{e,karta}}{R_e}}"],
    symbols: [
      ["t_{karta}", "grubość z karty o najwyższym Re"],
      ["R_{e,karta}", "granica plastyczności, dla której sporządzono kartę"],
      ["R_e", "granica plastyczności materiału (z atestu, jeśli podana)"],
    ],
    tip: "Moment gnący potrzebny do uplastycznienia blachy rośnie z Re · t², a moment maszyny jest stały, stąd pierwiastek.",
  },
  "process.flatEndFactor": {
    what: "Na początku i końcu arkusza zostaje odcinek, którego walce nie wyginają, bo muszą blachę nim chwycić. Zawijanie końców w walcarce czterowalcowej zmniejsza go do kilku grubości. Ten parametr to długość takiego odcinka wyrażona jako wielokrotność grubości.",
    effect:
      "Działa tylko przy włączonym „Naddatku na płaskie końce” i pustym polu długości: wydłuża blachę o dwa płaskie końce, które po walcowaniu się odcina. Przy wyłączonym naddatku nie wpływa na wynik.",
    range:
      "0–20. Czterowalcowa z zawijaniem: zwykle 0,5–2. Trzywalcowa bez zawijania: około połowy rozstawu walców dolnych.",
    formula: ["f = k_f \\cdot t", "L = \\pi \\cdot D_n + 2 f"],
    symbols: [
      ["f", "długość płaskiego końca, każda strona"],
      ["k_f", "ten współczynnik"],
      ["t", "grubość blachy"],
      ["D_n", "średnica osi obojętnej"],
      ["L", "długość blachy do cięcia"],
    ],
    example: "t = 10 mm, k_f = 1,5: f = 15 mm, blacha dłuższa o 30 mm.",
    tip: "Zmierz rzeczywisty płaski koniec po zawinięciu na swojej maszynie i podziel przez grubość. To najprostsza kalibracja tej wartości.",
  },
  "process.calibration": {
    what: "Mnożnik skalujący sprężynowanie przewidziane przez model. Model zakłada materiał sprężysto-idealnie plastyczny z minimalnym Re z normy, a rzeczywista blacha ma zwykle wyższe Re i się umacnia, więc odbija inaczej.",
    effect:
      "Ø wewnętrzna nastawcza w kalkulatorze, gdy pole współczynnika jest puste i materiał nie ma zapisanych prób. Długość blachy się nie zmienia.",
    range: "0–3. 0 = bez kompensacji, 1 = sam model. Po kalibracji zwykle 0,7–1,3.",
    formula: ["R_s = R_f - c \\cdot (R_f - R_m)"],
    symbols: [
      ["R_s", "promień do ustawienia na maszynie (oś obojętna)"],
      ["R_f", "promień docelowy, po odbiciu"],
      ["R_m", "promień nastawczy z modelu"],
      ["c", "współczynnik"],
    ],
    tip: "Zamiast zgadywać, użyj zakładki Kalibracja. Współczynnik z prób zapisuje się osobno dla każdego materiału i ma pierwszeństwo przed tą wartością.",
  },
  "process.springbackWarn": {
    what: "Próg sprężynowania (udział promienia), powyżej którego kalkulator pokazuje ostrzeżenie.",
    effect:
      "Tylko ostrzeżenie. Duże sprężynowanie występuje przy dużym R/t i wysokim Re: blacha jest wtedy zginana niewiele ponad granicę sprężystości, więc mały błąd Re daje duży błąd średnicy.",
    range: "1–99 %. Domyślnie 30 %.",
    formula: ["\\frac{R_f - R_s}{R_f} > p"],
    symbols: [
      ["R_f", "promień docelowy"],
      ["R_s", "promień nastawczy"],
      ["p", "ten próg"],
    ],
  },
  "mat.name": {
    what: "Oznaczenie gatunku wg normy, np. S355J2, P265GH, X2CrNiMo17-12-2.",
    effect: "Lista wyboru, raport PDF, historia, nazwy plików. Nie wpływa na obliczenia.",
    range: "Wymagane, unikalne w bazie.",
    tip: "Przy stalach nierdzewnych dopisz popularne oznaczenie w nawiasie, np. (316L). Łatwiej wtedy wyszukać.",
  },
  "mat.number": {
    what: "Numer materiałowy wg EN 10027-2 (np. 1.0577), dla aluminium oznaczenie chemiczne (np. AlMg4,5Mn0,7).",
    effect: "Opis na liście i w raporcie.",
    range: "Opcjonalne.",
  },
  "mat.group": {
    what: "Grupa, pod którą materiał pojawia się na liście wyboru.",
    effect: "Tylko kolejność listy.",
    range: "Jedna z pięciu grup.",
  },
  "mat.standard": {
    what: "Źródło wartości: norma z rokiem wydania (np. EN 10025-2:2019) albo karta dostawcy.",
    effect: "Widoczna pod wyborem materiału, więc zawsze wiadomo, skąd pochodzą dane.",
    range: "Opcjonalne, ale zalecane.",
    tip: "Wartości z norm są minimami gwarantowanymi. Rzeczywiste Re z atestu bywa wyższe o 10–30 %.",
  },
  "mat.yield": {
    what: "Granica plastyczności: naprężenie, przy którym materiał zaczyna odkształcać się trwale. Dla stali węglowych to ReH (górna granica), dla nierdzewnych i aluminium Rp0,2 (umowna, przy 0,2 % odkształcenia trwałego). Normy podają minimum malejące z grubością, dlatego wartości są w pasmach grubości.",
    effect:
      "Wyłącznie sprężynowanie i Ø nastawcza: im wyższe Re, tym większe odbicie. Długość blachy od Re nie zależy. Re z atestu wpisane w kalkulatorze zastępuje tę wartość.",
    range:
      "20–1500 MPa. Limity grubości rosnące, ostatnie pasmo może nie mieć limitu, Re mniejsze od Rm max.",
    formula: [...SPRINGBACK, PLANE_STRAIN],
    symbols: [
      ["x", "bezwymiarowy parametr zginania (dla x ≥ 0,5 blacha pozostaje sprężysta)"],
      ["R_s", "promień pod obciążeniem, czyli nastawa maszyny"],
      ["R_f", "promień po zdjęciu z maszyny"],
      ["R_e", "granica plastyczności"],
      ["E'", "moduł w płaskim stanie odkształcenia"],
      ["t", "grubość"],
    ],
    example: "S355J2 wg EN 10025-2: do 16 mm 355 MPa, 16–40 mm 345 MPa, 40–63 mm 335 MPa.",
    source:
      "Relacja sprężynowania dla czystego zginania materiału sprężysto-idealnie plastycznego, w płaskim stanie odkształcenia (podręczniki technologii kształtowania blach).",
  },
  "mat.rm": {
    what: "Wytrzymałość na rozciąganie: największe naprężenie, jakie przenosi próbka przed zerwaniem. Norma podaje zakres min–max.",
    effect:
      "Informacja i kontrola danych (Re musi być mniejsze od Rm max). Nie wpływa na obliczenia.",
    range: "Rm min < Rm max, typowo 150–1200 MPa.",
  },
  "mat.modulus": {
    what: "Moduł Younga: sztywność materiału w zakresie sprężystym, czyli stosunek naprężenia do odkształcenia. Dla stali praktycznie nie zależy od gatunku ani wytrzymałości.",
    effect:
      "Sprężynowanie: mniejszy E oznacza większe odbicie. Aluminium (E ≈ 70 GPa) przy tym samym Re odbija około trzy razy mocniej niż stal.",
    range: "Stal 200–210 GPa, nierdzewna austenityczna 193–200 GPa, aluminium 68–72 GPa.",
    formula: ["\\sigma = E \\cdot \\varepsilon", PLANE_STRAIN],
    symbols: [
      ["\\sigma", "naprężenie"],
      ["\\varepsilon", "odkształcenie"],
      ["E'", "moduł szerokiej blachy (płaski stan odkształcenia)"],
      ["\\nu", "liczba Poissona"],
    ],
  },
  "mat.poisson": {
    what: "Liczba Poissona: stosunek odkształcenia poprzecznego do podłużnego przy rozciąganiu.",
    effect:
      "Szeroka blacha nie może swobodnie odkształcać się na szerokości (płaski stan odkształcenia), co usztywnia ją o czynnik 1/(1 − ν²), dla stali około 1,10. Wpływa tylko na sprężynowanie.",
    range: "0,25–0,35. Stal 0,30, aluminium 0,33.",
    formula: [PLANE_STRAIN],
    symbols: [
      ["E", "moduł Younga"],
      ["\\nu", "liczba Poissona"],
    ],
  },
  "mat.density": {
    what: "Masa jednostki objętości materiału.",
    effect: "Tylko masa detalu w wynikach i raporcie.",
    range: "Aluminium ok. 2650–2700, stal ok. 7850, nierdzewna 7800–8000 kg/m³.",
    formula: ["m = A \\cdot t \\cdot \\rho"],
    symbols: [
      ["A", "pole rozwinięcia (z naddatkami)"],
      ["t", "grubość"],
      ["\\rho", "gęstość"],
    ],
    example: "Blacha 3173 × 2000 × 10 mm ze stali: 0,0635 m³ · 7850 kg/m³ ≈ 498 kg.",
  },
  "mat.minRt": {
    what: "Orientacyjny najmniejszy stosunek promienia wewnętrznego do grubości przy gięciu na zimno bez ryzyka pęknięć po stronie rozciąganej. Zależy od ciągliwości: stale wysokowytrzymałe potrzebują większych promieni.",
    effect: "Ostrzeżenie, gdy R/t detalu jest mniejsze. Nie blokuje obliczeń.",
    range:
      "0,5–10. Stale miękkie około 1, wysokowytrzymałe 2–3 (np. zalecenia EN 10149-2 dla S700MC).",
    formula: ["\\frac{r_i}{t} \\ge \\text{min R/t}"],
    symbols: [
      ["r_i", "promień wewnętrzny"],
      ["t", "grubość"],
    ],
    tip: "Przy walcowaniu płaszczy R/t jest zwykle duże (ponad 20), więc ten limit dotyczy głównie małych średnic i grubych blach.",
  },
  "mat.strainLimit": {
    what: "Największe odkształcenie włókna zewnętrznego, powyżej którego przepisy dla urządzeń ciśnieniowych mogą wymagać obróbki cieplnej po kształtowaniu na zimno.",
    effect: "Ostrzeżenie w kalkulatorze. Puste pole: brak ostrzeżenia.",
    range: "1–30 %. Stale ferrytyczne zwykle 5 %, duplex 10 %, austenityczne 15 %.",
    formula: [
      "\\varepsilon = \\frac{50 \\cdot t}{R_n} \\cdot (1 - \\frac{R_n}{R_0}) \\%",
      "R_0 = \\infty \\quad \\to \\quad \\varepsilon = \\frac{t}{2 R_n} = \\frac{t}{2 r_i + t}",
    ],
    symbols: [
      ["R_n", "promień osi obojętnej (środka grubości) po zwinięciu"],
      ["R_0", "promień początkowy, dla płaskiej blachy nieskończony"],
      ["r_i", "promień wewnętrzny"],
      ["t", "grubość"],
    ],
    example: "t = 10 mm, Ø wewn. 400 mm: ε = 10 / (400 + 10) ≈ 2,4 %.",
    source:
      "Kryteria kształtowania na zimno dla zbiorników ciśnieniowych (np. EN 13445-4 rozdz. 9). Obowiązujący limit sprawdź w normie właściwej dla wyrobu.",
  },
  "cal.material": {
    what: "Materiał próbki. Współczynnik jest przypisany do materiału, bo zależy od jego rzeczywistego Re i umocnienia.",
    effect:
      "Średnia z prób tego materiału staje się jego współczynnikiem sprężynowania w kalkulatorze.",
    range: "Dowolny materiał z bazy.",
  },
  "cal.thickness": {
    what: "Grubość blachy próbki.",
    effect: "Przeliczenie średnic wewnętrznych na promienie osi obojętnej i model porównawczy.",
    range: "Powyżej 0 mm.",
    formula: ["R = \\frac{D_i + t}{2}"],
    symbols: [
      ["R", "promień osi obojętnej"],
      ["D_i", "średnica wewnętrzna"],
    ],
    tip: "Najlepiej próbka o grubości i średnicy zbliżonej do typowych zleceń, bo współczynnik może nieco zależeć od R/t.",
  },
  "cal.reActual": {
    what: "Re z atestu 3.1 partii, z której pochodzi próbka.",
    effect:
      "Model porównawczy liczy z tą wartością. Puste pole: minimum z normy. Z atestem współczynnik opisuje tylko to, czego model nie ujmuje (umocnienie, sztywność maszyny), więc lepiej przenosi się na inne partie.",
    range: "Wartość z atestu, MPa.",
  },
  "cal.setInnerD": {
    what: "Średnica wewnętrzna zaprogramowana na maszynie (nastawa), przy której zwalcowano próbkę.",
    effect: "Punkt odniesienia do wyznaczenia rzeczywistego sprężynowania.",
    range: "Powyżej 0, mniejsza od zmierzonej.",
  },
  "cal.measuredInnerD": {
    what: "Średnica wewnętrzna zmierzona po zdjęciu próbki z maszyny.",
    effect: "Rzeczywiste sprężynowanie próbki.",
    range: "Większa od nastawionej, bo blacha zawsze odbija na zewnątrz.",
    formula: ["D_i = \\frac{C_z}{\\pi} - 2 t"],
    symbols: [
      ["C_z", "obwód zewnętrzny zmierzony taśmą"],
      ["t", "grubość"],
    ],
    tip: "Mierz poza strefą płaskich końców, w kilku miejscach na długości, i uśrednij. Obwód taśmą jest dokładniejszy niż średnica suwmiarką.",
  },
  "cal.factor": {
    what: "Stosunek rzeczywistego sprężynowania do przewidzianego przez model.",
    effect:
      "Średnia z prób materiału działa automatycznie w kalkulatorze, chyba że wpiszesz współczynnik ręcznie. Po kalibracji zapytanie o średnicę próbki zwraca dokładnie jej nastawę.",
    range: "Typowo 0,5–1,5. Wartości spoza zakresu zwykle oznaczają błąd pomiaru albo nastawy.",
    formula: ["c = \\frac{R_f - R_s}{R_f - R_m}"],
    symbols: [
      ["R_f", "zmierzony promień osi obojętnej"],
      ["R_s", "promień nastawiony na maszynie"],
      ["R_m", "nastawa z modelu dla promienia R_f"],
    ],
    example:
      "S235, t = 10 mm, nastawa Ø 850, wynik Ø 1000: c ≈ 1,11, czyli blacha odbiła o 11 % mocniej, niż przewidział model.",
  },
  "tpl.name": {
    what: "Nazwa szablonu widoczna na przycisku w kalkulatorze.",
    effect:
      "Szablon wczytuje zapisane dane jednym dotknięciem. Naddatek na płaskie końce zawsze startuje wyłączony.",
    range: "1–40 znaków.",
  },
};

const en: Record<DocId, ParamDoc> = {
  "machine.topRollD": {
    what: "Diameter of the top working roll. On a 4-roll machine the plate is pinched between the top and bottom rolls while the side rolls bend it. The top roll stays inside the shell being rolled, so it sets the smallest diameter that can be rolled.",
    effect:
      "Feasibility check: warning when the diameter to set on the machine (after springback compensation) does not clear the top roll. Roll size in the 3D view. Does not change the blank length or springback.",
    range: "Fixed at 338.38 mm (radius 169.19 mm) for this machine. Read-only.",
    formula: ["D_s > D_t", "D_{s,\\min} \\approx (1.1 \\ldots 1.2) \\cdot D_t"],
    symbols: [
      [
        "D_s",
        "inner diameter to set on the machine (smaller than the final one because the plate springs back)",
      ],
      ["D_t", "top roll diameter"],
    ],
    tip: "The shell opens up after release, so it is rolled tighter than its final size. That is why the app checks the set diameter against the roll, not the target.",
  },
  "machine.bottomRollD": {
    what: "Diameter of the bottom pinch roll. Together with the top roll it grips and drives the plate, so on a 4-roll machine the sheet does not slip and both ends can be pre-bent without turning it over.",
    effect: "3D roll size only. No effect on calculations.",
    range: "Fixed at 310.12 mm (radius 155.06 mm) for this machine. Read-only.",
  },
  "machine.sideRollD": {
    what: "Diameter of the side (bending) rolls. Raising a side roll relative to the pinch line sets the curvature: the higher, the smaller the radius. One side roll bends, the other supports and guides the plate; for the second end the roles swap.",
    effect:
      "3D roll size only. Side roll positions depend on the specific machine geometry and are not calculated here.",
    range: "Fixed at 240.02 mm (radius 120.01 mm) for both side rolls. Read-only.",
  },
  "machine.maxThickness": {
    what: "Largest thickness the machine rolls at full width, from the machine data. The maker states it for a given yield strength (usually steel with Re around 235–275 MPa) and usually for a given diameter.",
    effect:
      "Warning when exceeded. The moment needed to yield the section grows with the square of thickness and linearly with Re and width, so a stronger material lowers the allowable thickness and a narrower plate raises it.",
    range: "Typically 3–150 mm. Empty: no check.",
    formula: [
      "M_{\\text{pl}} = R_e \\cdot \\frac{b \\cdot t^2}{4}",
      "t_{\\text{allow}} \\approx t_{\\text{max}} \\cdot \\sqrt{\\frac{R_{e,\\text{ref}}}{R_e}}",
    ],
    symbols: [
      ["M_{\\text{pl}}", "moment that yields the whole plate section"],
      ["b", "plate width (rolling length)"],
      ["t", "plate thickness"],
      ["R_e", "yield strength of the rolled material"],
      ["R_{e,\\text{ref}}", "Re the rated capacity refers to"],
    ],
    example:
      "Machine rated 20 mm at Re 235 MPa, S355 plate (355 MPa) at full width: t_allow ≈ 20 · √(235/355) ≈ 16.3 mm.",
  },
  "machine.maxWidth": {
    what: "Maximum permitted plate width for this machine: 3000 mm, below its 3100 mm working roll length.",
    effect:
      "Warning when the plate width (cylinder) or the generator length (cone) exceeds it. A cone development lies in the rolls along its generator, so that is the working length it needs.",
    range: "Fixed at 3000 mm from the machine documentation. Read-only.",
    formula: ["s = \\frac{H}{\\cos \\alpha}"],
    symbols: [
      ["s", "cone generator length"],
      ["H", "cone height (axial)"],
      ["\\alpha", "half apex angle"],
    ],
  },
  "machine.minDiameter": {
    what: "Smallest inner diameter from the maker's documentation, usually stated for the maximum thickness.",
    effect:
      "Warning when the diameter to set on the machine (after springback compensation) is smaller. For a cone the small end is checked.",
    range: "Usually 1.1–1.5 × top roll Ø. Empty: no check.",
  },
  "machine.rollLength": {
    what: "This machine has a working roll length of 3100 mm and a maximum permitted plate width of 3000 mm.",
    effect:
      "Cone rule: the longer the slant compared with the rolls, the smaller the allowed share of nominal thickness (50 % up to ½ of the length, 40 % up to ¾, 30 % above).",
    range: "Fixed at 3100 mm for this machine. Read-only.",
    formula: [
      "t_{cone} \\le u \\cdot t_{nom}",
      "u = 0.5 \\quad s \\le 0.5 \\cdot L_w",
      "u = 0.4 \\quad s \\le 0.75 \\cdot L_w",
      "u = 0.3 \\quad s > 0.75 \\cdot L_w",
    ],
    symbols: [
      [
        "t_{nom}",
        "rolling chart thickness at the cone's small diameter (without a chart: machine maximum)",
      ],
      ["s", "cone slant length"],
      ["L_w", "roll working length"],
    ],
    source: "four-roll plate roll makers' guidance on cone rolling",
  },
  "machine.charts": {
    what: "Maker's tables of maximum plate thickness for a width and an inner diameter, separately for rolling and for pre-bending the ends, each for one yield strength (e.g. 260 and 360 MPa).",
    effect:
      "Warning when the thickness exceeds the chart value at the plate width and the set diameter. Linear interpolation between rows and columns, linear in Re between charts, square-root scaling for a material stronger than every chart. Exceeding the pre-bending chart with the flat-end allowance on is only a note.",
    range:
      "Values copied from the machine documentation. A narrower plate reads the first row, a larger diameter the last column (safe side). Diameter below the chart: no reading.",
    formula: ["t_{max}(R_e) = t_{chart} \\cdot \\sqrt{\\frac{R_{e,chart}}{R_e}}"],
    symbols: [
      ["t_{chart}", "thickness from the chart with the highest Re"],
      ["R_{e,chart}", "yield strength the chart was made for"],
      ["R_e", "material yield strength (from the certificate when given)"],
    ],
    tip: "The bending moment needed to yield the plate grows with Re · t² while the machine's moment is fixed, hence the square root.",
  },
  "process.flatEndFactor": {
    what: "At the start and end of the plate a strip stays unbent, because the rolls have to grip the plate by it. Pre-bending on a 4-roll machine shortens it to a few thicknesses. This parameter is that length as a multiple of thickness.",
    effect:
      "Only with the “flat-end allowance” on and the length field empty: lengthens the blank by two flat ends that are cut off after rolling. No effect while the allowance is off.",
    range:
      "0–20. 4-roll with pre-bending: usually 0.5–2. 3-roll without pre-bending: about half the bottom roll spacing.",
    formula: ["f = k_f \\cdot t", "L = \\pi \\cdot D_n + 2 f"],
    symbols: [
      ["f", "flat end length, each side"],
      ["k_f", "this factor"],
      ["t", "plate thickness"],
      ["D_n", "neutral axis diameter"],
      ["L", "blank length to cut"],
    ],
    example: "t = 10 mm, k_f = 1.5: f = 15 mm, the blank is 30 mm longer.",
    tip: "Measure the real flat end after pre-bending on your machine and divide it by the thickness. That is the simplest calibration of this value.",
  },
  "process.calibration": {
    what: "Multiplier scaling the springback predicted by the model. The model assumes an elastic / perfectly plastic material with the standard minimum Re, while real plate usually has a higher Re and work-hardens, so it springs back differently.",
    effect:
      "Set inner Ø in the calculator when its factor field is empty and the material has no saved trials. The blank length does not change.",
    range: "0–3. 0 = no compensation, 1 = model as-is. Usually 0.7–1.3 after calibration.",
    formula: ["R_s = R_f - c \\cdot (R_f - R_m)"],
    symbols: [
      ["R_s", "radius to set on the machine (neutral axis)"],
      ["R_f", "target radius, after springback"],
      ["R_m", "set radius predicted by the model"],
      ["c", "factor"],
    ],
    tip: "Instead of guessing, use the Calibration tab. Trial factors are stored per material and take precedence over this value.",
  },
  "process.springbackWarn": {
    what: "Springback threshold (share of the radius) above which the calculator shows a warning.",
    effect:
      "Warning only. Large springback happens at large R/t and high Re: the plate is then bent only slightly beyond its elastic limit, so a small error in Re gives a large diameter error.",
    range: "1–99 %. Default 30 %.",
    formula: ["\\frac{R_f - R_s}{R_f} > p"],
    symbols: [
      ["R_f", "target radius"],
      ["R_s", "set radius"],
      ["p", "this threshold"],
    ],
  },
  "mat.name": {
    what: "Grade designation per standard, e.g. S355J2, P265GH, X2CrNiMo17-12-2.",
    effect: "Selection list, PDF report, history, file names. No effect on calculations.",
    range: "Required, unique in the database.",
    tip: "For stainless grades add the common name in brackets, e.g. (316L), so it is easy to search for.",
  },
  "mat.number": {
    what: "Material number per EN 10027-2 (e.g. 1.0577); for aluminium the chemical designation (e.g. AlMg4.5Mn0.7).",
    effect: "Label in the list and report.",
    range: "Optional.",
  },
  "mat.group": {
    what: "Group the material is listed under.",
    effect: "List order only.",
    range: "One of five groups.",
  },
  "mat.standard": {
    what: "Source of the values: standard with its year (e.g. EN 10025-2:2019) or a supplier data sheet.",
    effect: "Shown under the material selector, so the data source is always visible.",
    range: "Optional but recommended.",
    tip: "Standard values are guaranteed minimums. The actual Re on a certificate is often 10–30 % higher.",
  },
  "mat.yield": {
    what: "Yield strength: the stress at which the material starts to deform permanently. For carbon steels it is ReH (upper yield strength), for stainless and aluminium Rp0.2 (proof stress at 0.2 % permanent strain). Standards give a minimum that falls with thickness, hence the thickness bands.",
    effect:
      "Springback and set Ø only: higher Re means more springback. The blank length does not depend on Re. A certificate Re entered in the calculator replaces this value.",
    range:
      "20–1500 MPa. Thickness limits increasing, the last band may be open-ended, Re below Rm max.",
    formula: [...SPRINGBACK, PLANE_STRAIN],
    symbols: [
      ["x", "dimensionless bending parameter (for x ≥ 0.5 the plate stays elastic)"],
      ["R_s", "radius under load, i.e. the machine setting"],
      ["R_f", "radius after release"],
      ["R_e", "yield strength"],
      ["E'", "plane-strain modulus"],
      ["t", "thickness"],
    ],
    example: "S355J2 per EN 10025-2: up to 16 mm 355 MPa, 16–40 mm 345 MPa, 40–63 mm 335 MPa.",
    source:
      "Springback relation for pure bending of an elastic / perfectly plastic material in plane strain (sheet metal forming textbooks).",
  },
  "mat.rm": {
    what: "Tensile strength: the highest stress a test piece carries before it breaks. The standard gives a min–max range.",
    effect: "Information and data check (Re must be below Rm max). No effect on calculations.",
    range: "Rm min < Rm max, typically 150–1200 MPa.",
  },
  "mat.modulus": {
    what: "Young's modulus: the material's stiffness in the elastic range, the ratio of stress to strain. For steel it hardly depends on grade or strength.",
    effect:
      "Springback: lower E means more springback. At the same Re aluminium (E ≈ 70 GPa) springs back about three times as much as steel.",
    range: "Steel 200–210 GPa, austenitic stainless 193–200 GPa, aluminium 68–72 GPa.",
    formula: ["\\sigma = E \\cdot \\varepsilon", PLANE_STRAIN],
    symbols: [
      ["\\sigma", "stress"],
      ["\\varepsilon", "strain"],
      ["E'", "modulus of a wide plate (plane strain)"],
      ["\\nu", "Poisson's ratio"],
    ],
  },
  "mat.poisson": {
    what: "Poisson's ratio: lateral strain divided by axial strain in tension.",
    effect:
      "A wide plate cannot deform freely across its width (plane strain), which stiffens it by 1/(1 − ν²), about 1.10 for steel. Affects springback only.",
    range: "0.25–0.35. Steel 0.30, aluminium 0.33.",
    formula: [PLANE_STRAIN],
    symbols: [
      ["E", "Young's modulus"],
      ["\\nu", "Poisson's ratio"],
    ],
  },
  "mat.density": {
    what: "Mass per unit volume of the material.",
    effect: "Part mass in the results and report only.",
    range: "Aluminium about 2650–2700, steel about 7850, stainless 7800–8000 kg/m³.",
    formula: ["m = A \\cdot t \\cdot \\rho"],
    symbols: [
      ["A", "development area (with allowances)"],
      ["t", "thickness"],
      ["\\rho", "density"],
    ],
    example: "3173 × 2000 × 10 mm steel plate: 0.0635 m³ · 7850 kg/m³ ≈ 498 kg.",
  },
  "mat.minRt": {
    what: "Indicative smallest inner radius to thickness ratio for cold bending without risk of cracking on the tension side. It depends on ductility: high-strength steels need larger radii.",
    effect: "Warning when the part's R/t is lower. Does not block the calculation.",
    range:
      "0.5–10. Mild steels about 1, high-strength 2–3 (e.g. EN 10149-2 recommendations for S700MC).",
    formula: ["\\frac{r_i}{t} \\ge \\text{min R/t}"],
    symbols: [
      ["r_i", "inner radius"],
      ["t", "thickness"],
    ],
    tip: "Rolled shells usually have a large R/t (over 20), so this limit mainly matters for small diameters and thick plate.",
  },
  "mat.strainLimit": {
    what: "Largest outer fibre strain above which pressure equipment codes may require heat treatment after cold forming.",
    effect: "Calculator warning. Empty: no warning.",
    range: "1–30 %. Ferritic steels usually 5 %, duplex 10 %, austenitic 15 %.",
    formula: [
      "\\varepsilon = \\frac{50 \\cdot t}{R_n} \\cdot (1 - \\frac{R_n}{R_0}) \\%",
      "R_0 = \\infty \\quad \\to \\quad \\varepsilon = \\frac{t}{2 R_n} = \\frac{t}{2 r_i + t}",
    ],
    symbols: [
      ["R_n", "neutral (mid-thickness) radius after rolling"],
      ["R_0", "initial radius, infinite for flat plate"],
      ["r_i", "inner radius"],
      ["t", "thickness"],
    ],
    example: "t = 10 mm, inner Ø 400 mm: ε = 10 / (400 + 10) ≈ 2.4 %.",
    source:
      "Cold forming criteria for pressure vessels (e.g. EN 13445-4 clause 9). Check the limit in the standard that applies to the product.",
  },
  "cal.material": {
    what: "Material of the trial part. The factor belongs to the material because it depends on its real Re and work hardening.",
    effect: "The mean of this material's trials becomes its springback factor in the calculator.",
    range: "Any material in the database.",
  },
  "cal.thickness": {
    what: "Plate thickness of the trial part.",
    effect: "Converts inner diameters to neutral radii and feeds the reference model.",
    range: "Above 0 mm.",
    formula: ["R = \\frac{D_i + t}{2}"],
    symbols: [
      ["R", "neutral radius"],
      ["D_i", "inner diameter"],
    ],
    tip: "Use a trial with thickness and diameter close to typical jobs, as the factor can depend slightly on R/t.",
  },
  "cal.reActual": {
    what: "Re from the 3.1 certificate of the batch the trial came from.",
    effect:
      "The reference model uses this value. Empty: standard minimum. With the certificate the factor only captures what the model misses (work hardening, machine stiffness), so it transfers better to other batches.",
    range: "Certificate value, MPa.",
  },
  "cal.setInnerD": {
    what: "Inner diameter programmed on the machine (the setting) when the trial was rolled.",
    effect: "Reference for the real springback.",
    range: "Above 0, smaller than the measured one.",
  },
  "cal.measuredInnerD": {
    what: "Inner diameter measured after the trial was released from the machine.",
    effect: "Real springback of the trial.",
    range: "Larger than the setting, because the plate always opens up.",
    formula: ["D_i = \\frac{C_o}{\\pi} - 2 t"],
    symbols: [
      ["C_o", "outer circumference measured with a tape"],
      ["t", "thickness"],
    ],
    tip: "Measure away from the flat ends, at several points along the length, and average. A tape on the circumference is more accurate than a caliper on the diameter.",
  },
  "cal.factor": {
    what: "Real springback divided by the springback predicted by the model.",
    effect:
      "The mean over a material's trials is used automatically in the calculator unless a factor is typed in. After calibration, asking for the trial's diameter returns exactly its setting.",
    range: "Typically 0.5–1.5. Values outside usually mean a measuring or setting error.",
    formula: ["c = \\frac{R_f - R_s}{R_f - R_m}"],
    symbols: [
      ["R_f", "measured neutral radius"],
      ["R_s", "radius set on the machine"],
      ["R_m", "model setting for radius R_f"],
    ],
    example:
      "S235, t = 10 mm, set Ø 850, result Ø 1000: c ≈ 1.11, the plate sprang back 11 % more than the model predicted.",
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

/** All formulas and symbols, for tests that every one of them parses. */
export function allDocs(): ParamDoc[] {
  return [...Object.values(pl), ...Object.values(en)];
}
