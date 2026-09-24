// User-requested teaching hold, 2026-09-24. These are concerns about the
// current examples, not claims that the Japanese constructions are impossible.
// The previously approved cards remain in the immutable naturalness proof.
export const USER_DIRECTED_USAGE_DEFERRALS = [
  {id:'usage:tearuNegativePast:verb:手伝う:てつだう',pair:'verb:手伝う:てつだう/tearuNegativePast',cardHash:'595cb6922db7f5bed92ee53e85a95fcfa4267411b99e7c07f798fb272a123ec9',concern:'劳务行为作为准备结果状态的表达自然度存疑。'},
  {id:'usage:tearu:verb:着る:きる',pair:'verb:着る:きる/tearu',cardHash:'ba31d4d4751772a0da3c2157da80958658c56109422e1a67d64cf7a75f239397',concern:'穿衣动作作为准备结果状态的表达自然度存疑。'},
  {id:'usage:tearuPast:verb:着る:きる',pair:'verb:着る:きる/tearuPast',cardHash:'2c50bdd7ee4c1c56d5cdc1e65cc8d4c02d31d568564bc9e1b8b87b611542b75d',concern:'穿衣动作作为过去的准备结果状态的表达自然度存疑。'},
  {id:'usage:tearuNegative:verb:守る:まもる',pair:'verb:守る:まもる/tearuNegative',cardHash:'9d2a8b082045a50c042602eb21e101e995563cd54d59e2d8b6d37cf3fd20b4c5',concern:'抽象防护以准备结果状态表述的自然度存疑。'},
  {id:'usage:teageruNegativePast:verb:急ぐ:いそぐ',pair:'verb:急ぐ:いそぐ/teageruNegativePast',cardHash:'42ead5c0fb661119f47cea4c0b2742891d55618e32470642fb47c9974a2c5a67',concern:'调整自身速度作为施惠动作的表达自然度存疑。'},
  {id:'usage:youtosuruNegative:verb:着く:つく',pair:'verb:着く:つく/youtosuruNegative',cardHash:'2e0d4b3a1888768489e1405f26ef517004b19131614c27a4ce67b1595b2b0eef',concern:'瞬间到达与否定尝试搭配的教学自然度存疑。'},
  {id:'usage:zuni:verb:要る:いる',pair:'verb:要る:いる/zuni',cardHash:'2ad228e793ca9600bf502e701f35e75319ed118cde0d9b19c29e8dd05f493ba0',concern:'当前「要らずに済む」例句的搭配和词义适切性存疑。'},
  {id:'usage:teoruNegative:verb:違う:ちがう',pair:'verb:違う:ちがう/teoruNegative',cardHash:'b3a84cbc4548cfc348395e904c878931c932caa684eb13b98073e41072193333',concern:'当前否定句的语体协调与自然度存疑。'},
  {id:'usage:teoruNegative',pair:'verb:使う:つかう/teoruNegative',cardHash:'08d419a42b77d47b30e4dbe2abdf058702411acec4266a37a102099c040b08cd',concern:'「おらない」在当前人物与语体中的自然度存疑。'},
  {id:'usage:teoruNegativePast:verb:使う:つかう',pair:'verb:使う:つかう/teoruNegativePast',cardHash:'3c7814d622f7c5080f3c389142e4d5ad6a2fdba078337593faa4e7be2cc92be4',concern:'「おらなかった」在当前人物与语体中的自然度存疑。'},
  {id:'usage:teoruNegative:verb:乗る:のる',pair:'verb:乗る:のる/teoruNegative',cardHash:'89e4bb54efd55bfd23c0f9614f86e174c229872a49134796ed1f92873bb5f460',concern:'「おらない」在当前人物与语体中的自然度存疑。'},
  {id:'usage:teoruNegativePast:verb:乗る:のる',pair:'verb:乗る:のる/teoruNegativePast',cardHash:'9236371140bfd3c9dd453a11c1babaa26236a4a2140a1eb159077afc8d2e8553',concern:'「おらなかった」在当前人物与语体中的自然度存疑。'},
  {id:'usage:teoruNegative:verb:打つ:うつ',pair:'verb:打つ:うつ/teoruNegative',cardHash:'4bc3ffee582a3aa2fa0cc8a58a24e826949b023764515db103084a1f3fd34585',concern:'「おらない」在当前人物与语体中的自然度存疑。'},
  {id:'usage:teoruNegativePast:verb:打つ:うつ',pair:'verb:打つ:うつ/teoruNegativePast',cardHash:'0f81356a62b3d42e4bf6788f65a5ace99737a17e75c93fc7e9810aa901e724df',concern:'「おらなかった」在当前人物与语体中的自然度存疑。'},
  {id:'usage:teoruNegative:verb:焼く:やく',pair:'verb:焼く:やく/teoruNegative',cardHash:'0414e460e42e09599029641400a4ed4c36eaf090603e071fac903d6f9de1e034',concern:'「おらない」在当前人物与语体中的自然度存疑。'},
  {id:'usage:teoruNegativePast:verb:焼く:やく',pair:'verb:焼く:やく/teoruNegativePast',cardHash:'8ca1b2f0ce7d4e32d225cb1c37ec409299cb76a3ddee1e38314e65f183b0bc52',concern:'「おらなかった」在当前人物与语体中的自然度存疑。'},
];

export const USER_DIRECTED_DEFERRED_PAIRS = new Set(USER_DIRECTED_USAGE_DEFERRALS.map(row => row.pair));
