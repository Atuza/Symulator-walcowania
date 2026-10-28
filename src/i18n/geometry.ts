import { PROFILE_SHAPES } from "../domain/shapes";
import type { Inputs } from "../state/inputs";
import { getLang, type Lang } from ".";
import type { ParamDoc } from "./docs";

type Shape = Inputs["shape"];
export const referenceShapes: Shape[] = ["cylinder", "cone", ...PROFILE_SHAPES];

const pl: Record<Shape | "surface" | "width", ParamDoc> = {
  surface: {
    what: "Wymiary przekroju podajesz po wybranej stronie blachy: wewnętrznej, środkowej albo zewnętrznej. Środkowa oznacza połowę grubości; nie jest tym samym co oś obojętna, jeśli k jest inne niż 0,5.",
    effect:
      "Zmienia przeliczenie podanych wymiarów na powierzchnię wewnętrzną. Rozwinięcie jest zawsze liczone po osi obojętnej. Długości prostych odcinków i kąty pozostają bez zmian.",
    range:
      "Wszystkie wymiary w mm, kąty w stopniach. Po odjęciu grubości promień wewnętrzny musi pozostać dodatni. Dla stożka przeliczenie uwzględnia pochylenie ścianki.",
    formula: ["r_i = r - c \\cdot t", "A_i = A - 2 c \\cdot t", "r_n = r_i + k \\cdot t"],
    symbols: [
      ["c", "0 dla strony wewnętrznej, 0,5 dla środkowej, 1 dla zewnętrznej"],
      ["t", "grubość blachy"],
      ["k", "położenie osi obojętnej jako ułamek grubości od wewnątrz"],
      ["r_i", "promień wewnętrzny"],
      ["r_n", "promień osi obojętnej"],
      ["A_i", "wymiar całkowity po stronie wewnętrznej"],
    ],
    example:
      "t = 10 mm, zewnętrzne Ø 1020 mm: wewnętrzne Ø 1000 mm. Przy k = 0,5 obojętne Ø wynosi 1010 mm.",
  },
  width: {
    what: "Szerokość blachy to długość detalu wzdłuż osi walców, prostopadła do kierunku zwijania. Nie jest długością rozwinięcia ani wymiarem A lub B przekroju.",
    effect:
      "Drugi bok prostokąta rozwinięcia, masa, kontrola szerokości roboczej i kart możliwości maszyny. Nie zmienia długości rozwinięcia przekroju.",
    range:
      "Dodatnia wartość w mm. Bez szerokości można obliczyć przekrój i długość, ale nie jego pełną masę ani wyeksportować kompletnego arkusza.",
    formula: ["m = L \\cdot W \\cdot t \\cdot \\rho"],
    symbols: [
      ["L", "długość rozwinięcia"],
      ["W", "szerokość blachy"],
      ["t", "grubość"],
      ["\\rho", "gęstość; przed liczeniem masy wymiary trzeba przeliczyć na metry"],
    ],
  },
  cylinder: {
    what: "Walec z jednego arkusza. Wybierz Ø albo R oraz stronę pomiaru. W trybie odwrotnym podaj długość blachy, a aplikacja obliczy średnicę wewnętrzną i zewnętrzną.",
    effect:
      "Średnica określa obwód po osi obojętnej. Naddatek dodaje płaski odcinek f na każdej krawędzi spoiny; domyślnie jest wyłączony.",
    range:
      "Średnica lub promień i grubość dodatnie; w trybie odwrotnym długość musi być większa niż oba naddatki. Ostry lub zbyt ciasny promień wywołuje ostrzeżenia procesu i maszyny.",
    formula: ["L = \\pi (D_i + 2 k t) + 2 f", "D_i = \\frac{L - 2 f}{\\pi} - 2 k t"],
    symbols: [
      ["D_i", "średnica wewnętrzna"],
      ["k", "współczynnik osi obojętnej"],
      ["t", "grubość"],
      ["f", "płaski koniec na każdą stronę"],
      ["L", "długość blachy do cięcia"],
    ],
    example: "Wewnętrzne Ø 1000, t = 10, k = 0,5, bez naddatku: L = π · 1010 = 3173,01 mm.",
  },
  cone: {
    what: "Ø większa D1 i Ø mniejsza D2 są mierzone w równoległych płaszczyznach końców. H to odległość tych płaszczyzn wzdłuż osi, nie długość tworzącej. Przesunięcie e jest odległością środków okręgów: 0 daje stożek współosiowy, wartość dodatnia stożek mimośrodowy.",
    effect:
      "Współosiowy rozwija się w wycinek pierścienia. Mimośrodowy ma obrys liczony numerycznie i różne długości tworzących; podane są co 30°, od najkrótszej. Przycisk „Płaski bok” ustawia e = (D1 − D2)/2. Szerokość roboczą maszyny sprawdzamy według najdłuższej tworzącej.",
    range:
      "D1 > D2 ≥ 0, H > 0, t > 0, e ≥ 0. Po przeliczeniu wybranej strony średnice wewnętrzne nie mogą być ujemne. D2 = 0 oznacza wierzchołek i wymaga szczególnej kontroli wykonalności.",
    formula: [
      "d = \\frac{D_1 - D_2}{2}",
      "g_{min} = \\sqrt{H^2 + (d - e)^2}",
      "g_{max} = \\sqrt{H^2 + (d + e)^2}",
      "e_{flat} = d",
    ],
    symbols: [
      ["D_1", "większa średnica na wybranej powierzchni"],
      ["D_2", "mniejsza średnica na tej samej powierzchni"],
      ["H", "wysokość osiowa"],
      ["e", "przesunięcie środków"],
      ["g_{min}", "najkrótsza tworząca"],
      ["g_{max}", "najdłuższa tworząca"],
    ],
    example:
      "Ø 2400 / 2200, H = 1250, e = 100 mm: płaski bok 1250,00 mm, najdłuższa tworząca 1265,90 mm.",
    tip: "Dla stożka mimośrodowego przeliczenie grubości na średnice używa średniego pochylenia ścianki. Jest przybliżeniem; rozwinięcie trzeba sprawdzić na detalu próbnym. 3D pokazuje blachę, bez nastaw i pochylenia walców. Nie ma tu skośnego ścięcia końców ani podziału na kilka arkuszy.",
  },
  halfround: {
    what: "Otwarty łuk: Ø lub R określa krzywiznę po wybranej stronie, a kąt określa, jaka część obwodu ma zostać zwinięta. 180° daje półokrąg.",
    effect:
      "Długość rośnie proporcjonalnie do kąta i promienia osi obojętnej. Naddatek f może wydłużyć oba otwarte końce.",
    range:
      "Promień wewnętrzny > 0, kąt większy od 0° i mniejszy od 360°. Pełny obwód wybierz jako Walec.",
    formula: ["L = (r_i + k t) \\cdot \\frac{\\pi \\theta}{180} + 2 f"],
    symbols: [
      ["r_i", "promień wewnętrzny; połowa Ø, jeśli wpisano średnicę"],
      ["\\theta", "kąt łuku w stopniach"],
      ["k", "współczynnik osi obojętnej"],
      ["t", "grubość"],
      ["f", "płaski naddatek na każdym końcu"],
    ],
    example: "Wewnętrzne Ø 1000, 180°, t = 10, k = 0,5: L = 1586,50 mm bez naddatku.",
  },
  ushape: {
    what: "Profil U ma dwa proste ramiona długości B połączone półokrągłym dnem. A jest szerokością między ramionami po wybranej stronie. B obejmuje samą prostą, bez łuku dna.",
    effect:
      "A ustala promień dna, każde zwiększenie B o 1 mm wydłuża blachę o 2 mm. Rozwinięcie pokazuje miejsca przejścia z prostej w łuk.",
    range:
      "A po przeliczeniu na stronę wewnętrzną > 0, B ≥ 0. Grubość i szerokość blachy dodatnie. Profil pozostaje otwarty.",
    formula: ["r_i = \\frac{A_i}{2}", "L = 2 B + \\pi (r_i + k t) + 2 f"],
    symbols: [
      ["A_i", "szerokość wewnętrzna"],
      ["B", "prosta długość każdego ramienia"],
      ["r_i", "promień dna od wewnątrz"],
      ["k", "współczynnik osi obojętnej"],
      ["t", "grubość"],
      ["f", "naddatek na każdą otwartą krawędź"],
    ],
  },
  obround: {
    what: "Zamknięty profil podłużny: dwa półokręgi połączone prostymi. A jest całkowitą długością przekroju, B całkowitą szerokością, a nie długością prostego boku. Spoina leży w połowie prostej.",
    effect:
      "Promień końców wynosi B/2 po stronie wewnętrznej, a długość każdej prostej A − B. Linie gięcia oddzielają proste od półokręgów.",
    range:
      "A ≥ B > 0 i dodatnia szerokość wewnętrzna po odjęciu grubości. Przy A = B profil przechodzi w okrąg.",
    formula: ["L = 2(A_i - B_i) + \\pi (B_i + 2 k t) + 2 f"],
    symbols: [
      ["A_i", "całkowita długość wewnętrzna"],
      ["B_i", "całkowita szerokość wewnętrzna"],
      ["k", "współczynnik osi obojętnej"],
      ["t", "grubość"],
      ["f", "opcjonalny naddatek przy spoinie"],
    ],
  },
  rect: {
    what: "Prostokąt o całkowitych bokach A i B z czterema zaokrąglonymi narożami R. A i B obejmują naroża. Spoina jest w połowie boku A.",
    effect:
      "Na każdym boku część prosta jest krótsza o 2R. Każde naroże obraca blachę o 90°. Oś obojętna i sprężynowanie są liczone dla promienia naroża.",
    range:
      "A, B, R > 0; R najwyżej połowa krótszego boku, po przeliczeniu promień wewnętrzny > 0. Mały narożnik może być geometrycznie poprawny, ale niemożliwy na danej walcarce.",
    formula: ["L = 2(A_i - 2 r_i) + 2(B_i - 2 r_i) + 2 \\pi (r_i + k t) + 2 f"],
    symbols: [
      ["A_i", "całkowity bok wewnętrzny A"],
      ["B_i", "całkowity bok wewnętrzny B"],
      ["r_i", "promień naroża od wewnątrz"],
      ["k", "współczynnik osi obojętnej"],
      ["t", "grubość"],
      ["f", "opcjonalny naddatek przy spoinie"],
    ],
  },
  tank: {
    what: "Zbiornik to owal z czterech stycznych łuków, nie elipsa. A jest całkowitą szerokością, B wysokością, R promieniem łuków bocznych. Promień dna i góry jest wyliczany, a spoina leży w połowie dna.",
    effect:
      "A, B i R wspólnie ustalają promień dna oraz kąty przejścia między łukami. Rozwinięcie sumuje długości po osi obojętnej, osobno dla obu promieni.",
    range:
      "A > B > 0, 0 < R < B/2, a po przeliczeniu dodatnie promienie wewnętrzne. Jeśli potrzebujesz prawdziwej elipsy, wybierz Elipsa.",
    formula: ["R_b = \\frac{(A_i/2-r_i)^2 + B_i^2/4 - r_i^2}{B_i - 2 r_i}"],
    symbols: [
      ["A_i", "szerokość wewnętrzna"],
      ["B_i", "wysokość wewnętrzna"],
      ["r_i", "promień boku od wewnątrz"],
      ["R_b", "wyliczony promień dna i góry od wewnątrz"],
    ],
    tip: "Rysunek i wynik „Promień dna i góry” podają ten promień po stronie wybranej w formularzu. Ostrzeżenia procesu używają najmniejszego promienia wewnętrznego.",
  },
  bucket: {
    what: "Otwarty profil łyżki składa się z prostej tylnej ściany A, jednego łuku o promieniu R i kącie θ oraz prostego dna B. A i B nie obejmują łuku.",
    effect:
      "Kąt jest obrotem blachy, a nie kątem wewnętrznym między ścianami. Każda prosta dodaje swoją długość; łuk jest liczony po osi obojętnej.",
    range:
      "A i B ≥ 0, promień wewnętrzny > 0, kąt większy od 0° i mniejszy od 360°. Naddatek może być dodany do obu otwartych końców.",
    formula: ["L = A + (r_i + k t) \\cdot \\frac{\\pi \\theta}{180} + B + 2 f"],
    symbols: [
      ["A", "prosta tylna ściana"],
      ["B", "proste dno"],
      ["r_i", "promień wewnętrzny"],
      ["\\theta", "obrót blachy w stopniach"],
      ["k", "współczynnik osi obojętnej"],
      ["t", "grubość"],
      ["f", "naddatek na każdą otwartą krawędź"],
    ],
  },
  ellipse: {
    what: "A i B to całkowite osie elipsy po wybranej stronie, nie półosie. Spoina jest w połowie dna. Krzywizna zmienia się płynnie.",
    effect:
      "Obwód wewnętrzny jest całkowany numerycznie, a przekrój odwzorowany 256 krótkimi łukami. Każdy ma własny współczynnik k. Nie ma umownych linii gięcia w DXF, bo nie ma granic między stałymi promieniami.",
    range:
      "A i B > 0; po odjęciu grubości obie półosie wewnętrzne dodatnie. A = B daje okrąg. Skrajne promienie mogą przekraczać możliwości maszyny.",
    formula: ["a = A_i/2", "b = B_i/2", "r_1 = b^2/a", "r_2 = a^2/b"],
    symbols: [
      ["a", "pozioma półoś wewnętrzna"],
      ["b", "pionowa półoś wewnętrzna"],
      ["r_1", "promień krzywizny na końcu osi poziomej"],
      ["r_2", "promień krzywizny na końcu osi pionowej"],
    ],
    tip: "Podane R min i R max to dokładne skrajne promienie. Rysunek jest przybliżeniem łukowym; dla elipsy 2400 × 1500 mm odchyłka zarysu jest rzędu 0,15 mm. Wymiary osi na rysunku odpowiadają wejściom.",
  },
  free: {
    what: "Budujesz profil w kolejności od pierwszej krawędzi blachy: L to długość prostej, R promień łuku po wybranej stronie, a kąt określa obrót. Ujemny kąt wygina w przeciwną stronę.",
    effect:
      "Długość rozwinięcia sumuje proste i łuki po osi obojętnej. Linie gięcia oznaczają granice odcinków. Profil jest zamknięty tylko wtedy, gdy obrót wynosi ±360°, a końce spotykają się w tolerancji 0,5 mm.",
    range:
      "Co najmniej jeden łuk. Długość każdej prostej > 0, promień wewnętrzny każdego łuku > 0, kąt skończony i różny od 0°. Niepełny wiersz nie daje wyniku. Zamknięcie nie jest kontrolą samoprzecięć ani kolizji z maszyną.",
    formula: [
      "L = l_1 + l_2 + \\ldots + (r_1+k_1 t)|\\theta_1| + (r_2+k_2 t)|\\theta_2| + \\ldots + 2 f",
    ],
    symbols: [
      ["l_i", "długość i-tej prostej"],
      ["r_i", "promień wewnętrzny i-tego łuku"],
      ["k_i", "współczynnik osi obojętnej dla tego łuku"],
      ["\\theta_i", "kąt łuku w radianach; w formularzu wpisujesz stopnie"],
      ["t", "grubość"],
      ["f", "naddatek na każdą krawędź"],
    ],
    tip: "Nie ma automatycznego dopasowywania ostatniego odcinka. Należy samodzielnie dobrać długości i kąty, aby uzyskać wymagany profil.",
  },
};

const en: Record<keyof typeof pl, ParamDoc> = {
  surface: {
    what: "Cross-section sizes use the selected inner, mid or outer plate surface. Mid means half the thickness; it is not the neutral fibre when k differs from 0.5.",
    effect:
      "Changes conversion of the entered dimensions to the inner surface. Development always follows the neutral fibre. Straight lengths and angles do not change.",
    range:
      "Sizes in mm, angles in degrees. The inner radius must remain positive after thickness conversion. Cone conversion accounts for the wall slope.",
    formula: pl.surface.formula,
    symbols: [
      ["c", "0 for inner, 0.5 for mid, 1 for outer"],
      ["t", "plate thickness"],
      ["k", "neutral fibre depth as a fraction of thickness from inside"],
      ["r_i", "inner radius"],
      ["r_n", "neutral radius"],
      ["A_i", "overall inner dimension"],
    ],
    example: "t = 10 mm, outer Ø 1020 mm: inner Ø 1000 mm. With k = 0.5 the neutral Ø is 1010 mm.",
  },
  width: {
    what: "Plate width is the part length along the rolls, across the rolling direction. It is neither the blank length nor a cross-section size A or B.",
    effect:
      "Second side of the rectangular blank, mass, working-width checks and capacity chart reading. Does not change the cross-section's blank length.",
    range:
      "Positive mm. Without a width the section and blank length can still be calculated, but not the full mass or a complete blank export.",
    formula: pl.width.formula,
    symbols: [
      ["L", "blank length"],
      ["W", "plate width"],
      ["t", "thickness"],
      ["\\rho", "density; convert dimensions to metres before calculating mass"],
    ],
  },
  cylinder: {
    what: "A cylinder from one plate. Select Ø or R and the reference surface. In reverse mode, enter the blank length to obtain inner and outer diameters.",
    effect:
      "Diameter sets the neutral-fibre circumference. The optional allowance adds a flat length f at each seam edge; it starts off.",
    range:
      "Positive diameter or radius and thickness. In reverse mode the blank must exceed both allowances together. Tight bends produce process and machine warnings.",
    formula: pl.cylinder.formula,
    symbols: [
      ["D_i", "inner diameter"],
      ["k", "neutral fibre factor"],
      ["t", "thickness"],
      ["f", "flat end per edge"],
      ["L", "blank length to cut"],
    ],
    example: "Inner Ø 1000, t = 10, k = 0.5, no allowance: L = π · 1010 = 3173.01 mm.",
  },
  cone: {
    what: "Large diameter D1 and small diameter D2 are measured in parallel end planes. H is their axial separation, not the generator length. Offset e is the distance between the end centres: 0 gives a concentric cone, a positive value an eccentric cone.",
    effect:
      "A concentric cone develops to an annular sector. An eccentric cone has a numerical contour and varying generators, listed every 30° from the shortest. Flat side sets e = (D1 − D2)/2. Machine working width is checked against the longest generator.",
    range:
      "D1 > D2 ≥ 0, H > 0, t > 0, e ≥ 0. Inner diameters must remain non-negative after surface conversion. D2 = 0 is an apex and needs special feasibility checks.",
    formula: pl.cone.formula,
    symbols: [
      ["D_1", "large diameter on the selected surface"],
      ["D_2", "small diameter on the same surface"],
      ["H", "axial height"],
      ["e", "centre offset"],
      ["g_{min}", "shortest generator"],
      ["g_{max}", "longest generator"],
    ],
    example:
      "Ø 2400 / 2200, H = 1250, e = 100 mm: flat side 1250.00 mm, longest generator 1265.90 mm.",
    tip: "For eccentric cones, thickness-to-diameter conversion uses the mean wall slope. This is an approximation; check the development on a trial part. 3D shows the plate without roll settings or tilt. Oblique end cuts and splitting across several blanks are not included.",
  },
  halfround: {
    what: "An open arc: Ø or R sets curvature on the selected surface and the angle sets the rolled fraction of a circumference. 180° gives a half circle.",
    effect:
      "Blank length is proportional to the angle and neutral radius. Allowance f can extend both open ends.",
    range:
      "Inner radius > 0 and angle strictly between 0° and 360°. For a full circumference select Cylinder.",
    formula: pl.halfround.formula,
    symbols: [
      ["r_i", "inner radius; half of Ø when a diameter is entered"],
      ["\\theta", "arc angle in degrees"],
      ["k", "neutral fibre factor"],
      ["t", "thickness"],
      ["f", "flat allowance at each end"],
    ],
    example: "Inner Ø 1000, 180°, t = 10, k = 0.5: L = 1586.50 mm without allowance.",
  },
  ushape: {
    what: "A U profile has two straight legs of length B joined by a semicircular bottom. A is the width across the legs on the selected surface. B is the straight portion only, excluding the bottom arc.",
    effect:
      "A sets the bottom radius; adding 1 mm to B adds 2 mm to the blank. Development marks transitions from straight to arc.",
    range:
      "Inner width A > 0 after conversion, B ≥ 0. Positive thickness and plate width. The profile remains open.",
    formula: pl.ushape.formula,
    symbols: [
      ["A_i", "inner width"],
      ["B", "straight length of each leg"],
      ["r_i", "inner bottom radius"],
      ["k", "neutral fibre factor"],
      ["t", "thickness"],
      ["f", "allowance at each open edge"],
    ],
  },
  obround: {
    what: "A closed obround has two semicircles joined by straights. A is the overall length and B the overall width, not a straight-side length. The seam is at mid-straight.",
    effect:
      "End inner radius is B/2 on the inner surface; each straight is A − B long. Bend lines separate straights from semicircles.",
    range:
      "A ≥ B > 0, with positive inner width after thickness conversion. A = B becomes a circle.",
    formula: pl.obround.formula,
    symbols: [
      ["A_i", "overall inner length"],
      ["B_i", "overall inner width"],
      ["k", "neutral fibre factor"],
      ["t", "thickness"],
      ["f", "optional allowance at each seam edge"],
    ],
  },
  rect: {
    what: "A rectangle with overall sides A and B and four rounded corners R. A and B include the corners. The seam is at the middle of side A.",
    effect:
      "Each straight is its overall side minus 2R. Each corner turns the plate by 90°. Neutral fibre and springback use the corner radius.",
    range:
      "A, B, R > 0; R no more than half the shorter side; positive inner radius after conversion. A tight corner can be geometrically valid but impossible on the selected machine.",
    formula: pl.rect.formula,
    symbols: [
      ["A_i", "overall inner side A"],
      ["B_i", "overall inner side B"],
      ["r_i", "inner corner radius"],
      ["k", "neutral fibre factor"],
      ["t", "thickness"],
      ["f", "optional allowance at each seam edge"],
    ],
  },
  tank: {
    what: "Tank is a four-tangent-arc oval, not an ellipse. A is overall width, B height, R the side-arc radius. Top and bottom radius is derived; the seam is at mid-bottom.",
    effect:
      "A, B and R jointly set the bottom radius and transition angles. Development sums neutral lengths separately for both bend radii.",
    range:
      "A > B > 0, 0 < R < B/2, with positive inner radii after conversion. For a true ellipse choose Ellipse.",
    formula: pl.tank.formula,
    symbols: [
      ["A_i", "inner width"],
      ["B_i", "inner height"],
      ["r_i", "inner side radius"],
      ["R_b", "derived inner top and bottom radius"],
    ],
    tip: "The drawing and Top and bottom radius result use the selected surface. Process warnings use the smallest inner bend radius.",
  },
  bucket: {
    what: "An open bucket profile is a straight back A, one arc of radius R and angle θ, then straight bottom B. A and B exclude the arc.",
    effect:
      "Angle is the plate turning angle, not the interior angle between the walls. Each straight adds its length; the arc follows the neutral fibre.",
    range:
      "A and B ≥ 0, inner radius > 0, angle strictly between 0° and 360°. Allowance can extend both open ends.",
    formula: pl.bucket.formula,
    symbols: [
      ["A", "straight back"],
      ["B", "straight bottom"],
      ["r_i", "inner radius"],
      ["\\theta", "plate turn in degrees"],
      ["k", "neutral fibre factor"],
      ["t", "thickness"],
      ["f", "allowance at each open edge"],
    ],
  },
  ellipse: {
    what: "A and B are the full ellipse axes on the selected surface, not semi-axes. The seam is at mid-bottom. Curvature changes continuously.",
    effect:
      "The inner perimeter is integrated numerically and the section represented by 256 short arcs, each with its own k. DXF has no artificial bend lines because there are no discrete constant-radius bends.",
    range:
      "A and B > 0; both inner semi-axes must remain positive after thickness conversion. A = B gives a circle. Extreme bend radii may exceed machine capability.",
    formula: pl.ellipse.formula,
    symbols: [
      ["a", "horizontal inner semi-axis"],
      ["b", "vertical inner semi-axis"],
      ["r_1", "curvature radius at the horizontal-axis end"],
      ["r_2", "curvature radius at the vertical-axis end"],
    ],
    tip: "R min and R max are exact extreme curvature radii. The drawing is an arc approximation; outline deviation is about 0.15 mm for a 2400 × 1500 mm ellipse. Axis dimensions match the inputs.",
  },
  free: {
    what: "Build the profile in plate order from its first edge: L is straight length, R an arc radius on the selected surface, and angle its turn. A negative angle bends the other way.",
    effect:
      "Blank length sums straights and neutral-fibre arcs. Bend lines mark segment boundaries. A profile is closed only if its turn is ±360° and its ends meet within 0.5 mm.",
    range:
      "At least one arc. Each straight length > 0, each inner arc radius > 0, each angle finite and non-zero. An incomplete row has no result. Closure does not check self-intersections or machine collisions.",
    formula: pl.free.formula,
    symbols: [
      ["l_i", "length of straight i"],
      ["r_i", "inner radius of arc i"],
      ["k_i", "neutral fibre factor for that arc"],
      ["\\theta_i", "arc angle in radians; the form uses degrees"],
      ["t", "thickness"],
      ["f", "allowance at each edge"],
    ],
    tip: "The last segment is not fitted automatically. Choose lengths and angles to obtain the intended profile.",
  },
};

const docs: Record<Lang, typeof pl> = { pl, en };

export function geometryDoc(id: Shape | "surface" | "width"): ParamDoc {
  return docs[getLang()][id];
}

export function allGeometryDocs(): ParamDoc[] {
  return [...Object.values(pl), ...Object.values(en)];
}
