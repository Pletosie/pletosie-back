import { AudioService } from "../src/audio.service";
function wav(seconds: number) {
  const b = Buffer.alloc(44 + 16000 * 2 * seconds);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(b.length - 44, 40);
  return b;
}
describe("Durée des vocaux normalisés", () => {
  it("mesure la durée réelle des échantillons PCM", async () => {
    const result = await new AudioService().validate(wav(3).toString("base64"));
    expect(result.mime).toBe("audio/wav");
    expect(result.duration).toBeCloseTo(3, 2);
  });
  it("continue à refuser un vocal dépassant trois minutes", async () => {
    await expect(
      new AudioService().validate(wav(181).toString("base64")),
    ).rejects.toThrow("trois minutes");
  });
});
