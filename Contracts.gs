// gas/Contracts.gs
const CONTRACT = {
  apiVersion: '2.1.0',
  actions: {
    healthcheck: { in:{}, out:{ ok:'boolean', apiVersion:'string', ts:'number' } },
    login: { in:{ staffId:'string', userName:'string' }, out:{ ok:'boolean', user:{staffId:'string',name:'string',role:'string'} } },
    startQuiz: { in:{ staffId:'string', mode:'string' }, out:{
      ok:'boolean', quizId:'string', mode:'string', limit:'number', timePerQSec:'number',
      questions:[{ qid:'string', imageUrl:'string?', options:[{oid:'string', label:'string'}] }]
    }},
    gradeQuiz: { in:{ quizId:'string', staffId:'string', answers:[{qid:'string', oid:'string', tMs:'number', h1:'boolean', h2:'boolean'}] },
      out:{ ok:'boolean', score:'number', total:'number', correct:'number',
        per:[{qid:'string', isCorrect:'boolean', correctLabel:'string', chooseLabel:'string', tMs:'number', h1:'boolean', h2:'boolean'}] } },
    submitResult: { in:{ quizId:'string', staffId:'string', userName:'string', mode:'string', result:'object' }, out:{ ok:'boolean' } },
    getRanking: { in:{ period:'string', store:'string?' }, out:{ ok:'boolean', rows:'object[]' } },
    getMyPage: { in:{ staffId:'string' }, out:{ ok:'boolean', summary:'object', trend:'object[]', weaknesses:'object[]' } },
    resetDaily: { in:{ staffId:'string' }, out:{ ok:'boolean', remainingReset:'number' } }
  }
};

