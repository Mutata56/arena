"""Read-only Arena preview using fictional lessons and progress."""
from pathlib import Path
from demo_server import serve

NODE = {'id':1,'code':'1.01','title':'Переменные и типы','kind':'тема','status':'working',
        'stage_num':1,'stage_shown':1,'stage_title':'Основы Java','lang':'java',
        'descr':'Учимся хранить значения и выбирать подходящие типы.', 'close':{'mode':'atoms'}}
NODES = [NODE, {**NODE,'id':2,'code':'1.02','title':'Условия и ветвления','status':'available'},
         {**NODE,'id':3,'code':'1.03','title':'Циклы и массивы','status':'available'}]
STAGES = [dict(num=1,shown=1,title='Основы Java',total=3,closed=0,working=1,locked=False,done=False,current=True,boss_at=3,boss_ready=False,boss_passed=False),
          dict(num=2,shown=2,title='Коллекции',total=4,closed=0,working=0,locked=True,done=False,current=False,boss_at=3,boss_ready=False,boss_passed=False),
          dict(num=3,shown=3,title='Объекты и классы',total=5,closed=0,working=0,locked=True,done=False,current=False,boss_at=4,boss_ready=False,boss_passed=False)]
MARKDOWN = '''# Переменные и типы

## Что такое переменная
Переменная хранит значение, к которому можно обратиться по имени. Сначала выберите тип, затем дайте переменной понятное имя.

```java
int completedTasks = 3;
double completionRate = 0.75;
boolean ready = true;
String message = "Начинаем практику";
```

## Тип определяет операции
Целые числа подходят для счётчиков. Дробные — для измерений. Логические значения описывают выбор между двумя состояниями, а строки хранят текст.

## Проверьте понимание
Назовите типы четырёх значений в примере. Затем откройте практическую задачу и реализуйте простой счётчик.

## Демонстрационный материал
Этот конспект и все показатели созданы для публичного примера. Здесь нет личных заметок, импортированных курсов и настоящего прогресса.
'''
TASK = {'item_id':1,'node_code':'1.01','title':'Счётчик завершённых заданий','lang':'java','lvl':1,
        'statement_md':'# Счётчик\n\nРеализуйте метод `add`, который увеличивает счётчик на переданное неотрицательное число.\n\n- Начальное значение: 0.\n- После `add(3)` значение равно 3.\n- Отрицательное число не изменяет счётчик.',
        'starter_files':{'Counter.java':'public class Counter {\n    private int value;\n\n    public void add(int amount) {\n        // Дополните решение\n    }\n\n    public int getValue() {\n        return value;\n    }\n}\n'},
        'checks':0,'xp':60,'visible_cases':['Начальное значение равно нулю','Положительное число увеличивает счётчик','Отрицательное число игнорируется'],
        'visible_tests':'', 'status':'available'}


def fixture(path):
    if path=='/api/today':
        return {'node':NODE,'xp':{'today':45,'total':180},'streak':3,'contract':{'quiz_done':4,'quiz_target':10,'cards_done':2,'cards_target':5,'done':False},'cards_due':3}
    if path=='/api/tracks':return {'tracks':[{'key':'java','title':'Java','subtitle':'путь к джуну','prefix':'','offset':0,'inTrack':True}],'default':'java'}
    if path=='/api/map':return {'stages':STAGES,'trackKey':'java','trackTitle':'Java','inTrack':True,'track':{'closed':0,'total':12},'eta':None,'current':'1.01'}
    if path.startswith('/api/map/stage/'):
        num=int(path.rsplit('/',1)[1]);return {**STAGES[min(max(num-1,0),2)],'nodes':NODES if num==1 else [],'shown':num,'lang':'java','trackKey':'java'}
    if path.startswith('/api/site/note/'):return {'node':NODE,'exists':True,'markdown':MARKDOWN}
    if path.startswith('/api/site/node/') and path.endswith('/items'):return {'code':'1.01','quiz':[],'cards':[],'tasks':[TASK]}
    if path=='/api/site/task/1':return TASK
    if path=='/api/gen/now':return {'running':None,'waiting':0}
    if path.startswith('/api/node/'):return NODE
    return None


if __name__=='__main__':
    serve(Path(__file__).resolve().parents[1]/'static/site',fixture,asset_prefix='/static/site/')
