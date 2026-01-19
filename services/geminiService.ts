import { GoogleGenAI, Type, Schema } from "@google/genai";

// process.env ではなく Vite の環境変数読み込み方式に書き換えます
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export interface AIAnalysisResult {
  isAppropriate: boolean;
  category: string;
  tags: string[];
  refinedTitle?: string;
  refinedContent?: string;
  advice?: string;
}

const SCHOOL_RULES = `
現在の学校のきまり（校則）:
１．願・届について: すべてペン書き。早退・忌引・住所変更・学割は届け出が必要。アルバイトは禁止。
２．通学について: 徒歩通学。8:30着席（遅刻は職員室へ）。部活終了時刻は季節による。
３．服装について: 
- 標準服（制服）着用。女子スラックス可。ワイシャツは白標準。
- 変形学生服、華美なベルト不可。スカート丈は膝程度。
- 靴下は白・紺・黒の無地（ワンポイント可）。くるぶし・ルーズ不可。
- 夏服（6月～）：ネクタイ・リボンなし可。
- 冬服（11月～）：セーター・ベストは黒・紺無地Vネック。コートは黒・紺・グレー・茶。タイツ可。
- 通学靴は運動靴（ハイカット不可）。
- 衣替え移行期間あり。
４．頭髪など: 清潔な髪型。肩についたら結ぶ（黒・紺・茶ゴム）。染髪・特異な髪型・化粧・眉加工禁止。
５．持ち物: 指定カバン・サブバッグ。キーホルダー1個まで。不要物持ち込み禁止。
６．化粧・装飾品・日傘: 化粧不可（日焼け止め・制汗剤は可）。日傘可。アクセサリー不可。
７．弁当・水筒: 水筒可（中身はスポーツドリンクか茶）。買い食い禁止。
８．日常生活: 校内は走らない。他クラスに入らない。チョーク補充は許可制。落書き禁止。
`;

export const analyzeProposal = async (title: string, content: string): Promise<AIAnalysisResult> => {
  try {
    const model = 'gemini-2.0-flash-exp'; 
    
    const prompt = `
      あなたは中学校の生徒会目安箱の「AIアドバイザー」です。
      生徒が投稿しようとしている意見（タイトル、内容）を読み、以下のタスクを実行してください。

      ${SCHOOL_RULES}

      タスク:
      1. **カテゴリー分類**: 内容に基づき、「校則」「設備・環境」「授業」「その他」のいずれか1つを選択してください。
      2. **タグ生成**: 内容に関連するハッシュタグを3〜5個生成してください（例: #校則 #スマホ）。
      3. **適切性判定**: 
         - このプラットフォームは「校則を変えること」も目的としています。したがって、**「現在の校則に反する提案（例：スマホを持ち込みたい、靴下の色を自由にしてほしい）」は『適切(true)』と判定してください。**
         - **『不適切(false)』**と判定すべきは以下のケースです：
            a. 個人（先生や生徒）への誹謗中傷、いじめ、悪口。
            b. 暴力的な表現、脅迫、差別的発言。
            c. 教育機関として明らかにふさわしくない、常識外れな要求（例：学校でタバコを吸わせろ、窓ガラスを割りたい、先生を殴りたい等）。
            d. 意味不明な文字列。
      4. **改善案とアドバイス**: 
         - 適切な場合: より説得力を増すための修正案（敬語への修正、理由の補足など）と、応援のアドバイスを作成してください。
         - 不適切な場合: なぜダメなのかを優しく諭し、どう書き直せば意見として成立するかアドバイスしてください。

      入力情報:
      - タイトル: ${title}
      - 内容: ${content}
      
      出力は必ずJSON形式で行ってください。
    `;

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        isAppropriate: {
          type: Type.BOOLEAN,
          description: "投稿内容がガイドラインに沿っていて適切かどうか。",
        },
        category: {
          type: Type.STRING,
          description: "自動判定されたカテゴリー。「校則」「設備・環境」「授業」「その他」のいずれか。",
          enum: ["校則", "設備・環境", "授業", "その他"]
        },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "内容に関連するハッシュタグ（#を含めること）。",
        },
        refinedTitle: {
          type: Type.STRING,
          description: "より建設的で明確なタイトル案。",
        },
        refinedContent: {
          type: Type.STRING,
          description: "より説得力があり丁寧な内容案。AIが生成したタグを末尾に追加すること。",
        },
        advice: {
          type: Type.STRING,
          description: "生徒への具体的なフィードバック。です・ます調で優しく。",
        },
      },
      required: ["isAppropriate", "category", "tags", "refinedTitle", "refinedContent", "advice"],
    };

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(text) as AIAnalysisResult;
    return result;

  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return {
      isAppropriate: false,
      category: "その他",
      tags: [],
      advice: "AIチェック機能に一時的な不具合が発生しています。時間をおいて再度お試しください。"
    };
  }
};
